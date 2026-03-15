/*
  ESP32-C6 AD8232 WebSocket ECG streamer
  - Default: runs as Wi-Fi Access Point (SSID: ESP32-ECG)
  - WebSocket server on port 81
  - Samples AD8232 analog OUTPUT pin at ~250 Hz using esp_timer
  - Sends raw int16 samples as binary messages (little-endian), one sample per WebSocket message

  Wiring (AD8232 -> ESP32-C6):
    3V3   -> 3.3V
    GND   -> GND
    LO+   -> GPIO2
    LO-   -> GPIO1
    OUTPUT-> GPIO0  (ADC pin)

  Notes / Assumptions:
  - This sketch uses the Arduino core for ESP32. Ensure your board package supports ESP32-C6.
  - By default this device creates an open Access Point (no password) to simplify setup. For production, configure WPA2 and/or run in STA mode.
  - ADC resolution and attenuation can be adjusted depending on sensor characteristics. We send raw ADC integers as int16 and do NOT add metadata.
  - Frontend expects one numeric sample per WebSocket message. We send binary int16 (2 bytes, little-endian).
  - If you prefer ASCII integers per message, change sendSample() to sendTXT instead.

  IP configuration:
  - AP mode default IP is 192.168.4.1 (connect client to ESP32 Wi-Fi and open ws://192.168.4.1:81)
  - To use STA (join router), set USE_STA true and fill WIFI_SSID and WIFI_PASS below.

  Author: Generated for medical prototype. Review for regulatory requirements before clinical use.
*/

#include <WiFi.h>
#include <ESPmDNS.h>
#include <WebSocketsServer.h>
#include "esp_timer.h"

// --- Configuration ---
#define USE_STA false
const char* WIFI_SSID = "YOUR_SSID";    // only used if USE_STA true
const char* WIFI_PASS = "YOUR_PASS";    // only used if USE_STA true

const char* AP_SSID = "ESP32-ECG";      // default access point SSID
const uint16_t WS_PORT = 81;

// AD8232 OUTPUT pin -> ADC pin
// As wired: OUTPUT -> GPIO0
const int ECG_PIN = 0; // adjust if different wiring

// Sampling
const double SAMPLE_RATE = 250.0; // Hz target
const int BUFFER_SIZE = 1024; // circular buffer for samples

// --- Globals ---
WebSocketsServer webSocket = WebSocketsServer(WS_PORT);
static volatile int16_t sampleBuffer[BUFFER_SIZE];
static volatile uint32_t bufHead = 0;
static volatile uint32_t bufTail = 0;
static esp_timer_handle_t sampling_timer = NULL;

// Helper to push sample into buffer (called from timer ISR)
static inline void bufferPush(int16_t v) {
  uint32_t next = (bufHead + 1) % BUFFER_SIZE;
  if (next == bufTail) {
    // buffer full, drop oldest
    bufTail = (bufTail + 1) % BUFFER_SIZE;
  }
  sampleBuffer[bufHead] = v;
  bufHead = next;
}

// Helper to pop sample from buffer (called from loop context)
static inline bool bufferPop(int16_t &out) {
  if (bufHead == bufTail) return false;
  out = sampleBuffer[bufTail];
  bufTail = (bufTail + 1) % BUFFER_SIZE;
  return true;
}

// Timer callback runs at SAMPLE_RATE and reads ADC
void IRAM_ATTR sampling_cb(void* arg) {
  // Read raw ADC value (0..4095 typical for 12-bit)
  int raw = analogRead(ECG_PIN);
  // Convert to int16 for transport. Keep raw value; frontend must interpret accordingly.
  int16_t v = (int16_t)raw;
  bufferPush(v);
}

void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  // Keep minimal: we don't expect messages from clients. Could handle simple commands in future.
  if (type == WStype_CONNECTED) {
    IPAddress ip = webSocket.remoteIP(num);
    Serial.printf("Client %u connected from %s\n", num, ip.toString().c_str());
  } else if (type == WStype_DISCONNECTED) {
    Serial.printf("Client %u disconnected\n", num);
  }
}

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("ESP32 ECG WebSocket streamer starting...");

  // ADC setup: set resolution and attenuation as needed
  analogReadResolution(12); // 12-bit
  analogSetPinAttenuation(ECG_PIN, ADC_11db); // extend input range if needed

  if (USE_STA) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    Serial.println("Connecting to Wi-Fi...");
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
      delay(200);
      Serial.print('.');
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println();
      Serial.print("Connected. IP: ");
      Serial.println(WiFi.localIP());
      // advertise mDNS name for easier discovery (esp32-ecg.local)
      if (MDNS.begin("esp32-ecg")) {
        Serial.println("mDNS responder started: esp32-ecg.local");
      } else {
        Serial.println("mDNS responder failed to start");
      }
    } else {
      Serial.println();
      Serial.println("Failed to connect to Wi-Fi; falling back to AP mode.");
      WiFi.mode(WIFI_AP);
      WiFi.softAP(AP_SSID);
      Serial.print("AP IP: ");
      Serial.println(WiFi.softAPIP());
    }
  } else {
    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID);
    Serial.print("AP started. Connect to Wi-Fi SSID: ");
    Serial.println(AP_SSID);
    Serial.print("AP IP: ");
    Serial.println(WiFi.softAPIP());
    // mDNS in AP mode may not be resolvable from all clients, but register nonetheless
    if (MDNS.begin("esp32-ecg")) {
      Serial.println("mDNS responder started (AP): esp32-ecg.local");
    }
  }

  // Start WebSocket server
  webSocket.begin();
  webSocket.onEvent(onWebSocketEvent);
  Serial.printf("WebSocket server started on port %u\n", WS_PORT);

  // Create esp_timer for sampling
  const esp_timer_create_args_t timer_args = {
    .callback = &sampling_cb,
    .arg = NULL,
    .name = "ecg_sampler"
  };
  esp_timer_create(&timer_args, &sampling_timer);

  // Start timer with microsecond interval
  const int64_t interval_us = (int64_t)(1e6 / SAMPLE_RATE);
  esp_timer_start_periodic(sampling_timer, interval_us);
}

void loop() {
  webSocket.loop();

  // Send buffered samples to connected clients
  if (webSocket.connectedClients() > 0) {
    int16_t sample;
    // Batch sending: send up to a small batch to avoid starving loop
    int sent = 0;
    while (sent < 64 && bufferPop(sample)) {
      // Send binary little-endian int16
      uint8_t payload[2];
      payload[0] = (uint8_t)(sample & 0xFF);
      payload[1] = (uint8_t)((sample >> 8) & 0xFF);
      // Broadcast to all connected clients
      webSocket.broadcastBIN(payload, 2);
      sent++;
    }
  } else {
    // No clients: optionally drain buffer to avoid overflow or keep data depending on policy
    // Here we drop oldest if buffer gets large (timer already does drop when full)
    delay(2);
  }
}
