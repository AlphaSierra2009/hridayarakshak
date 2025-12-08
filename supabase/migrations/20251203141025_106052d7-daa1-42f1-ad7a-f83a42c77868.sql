-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Emergency contacts table
CREATE TABLE public.emergency_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  relationship TEXT,
  priority INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Devices table (Arduino devices)
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  device_name TEXT NOT NULL,
  device_token TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_seen TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ECG readings table
CREATE TABLE public.ecg_readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  reading_value FLOAT NOT NULL,
  reading_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  heart_rate INTEGER,
  st_elevation_detected BOOLEAN DEFAULT false,
  latitude FLOAT,
  longitude FLOAT
);

-- Hospitals table
CREATE TABLE public.hospitals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  phone_number TEXT,
  latitude FLOAT NOT NULL,
  longitude FLOAT NOT NULL,
  has_ambulance BOOLEAN DEFAULT true,
  has_cardiac_unit BOOLEAN DEFAULT true,
  is_multi_facility BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Emergency alerts table
CREATE TABLE public.emergency_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  alert_type TEXT NOT NULL DEFAULT 'st_elevation',
  status TEXT NOT NULL DEFAULT 'pending',
  latitude FLOAT,
  longitude FLOAT,
  ecg_reading_id UUID REFERENCES public.ecg_readings(id),
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);

-- Alert notifications sent table
CREATE TABLE public.alert_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id UUID REFERENCES public.emergency_alerts(id) ON DELETE CASCADE NOT NULL,
  recipient_type TEXT NOT NULL, -- 'hospital' or 'contact'
  recipient_id UUID NOT NULL,
  notification_method TEXT NOT NULL, -- 'sms', 'email', 'api'
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

-- Create indexes for performance
CREATE INDEX idx_ecg_readings_device ON public.ecg_readings(device_id);
CREATE INDEX idx_ecg_readings_user ON public.ecg_readings(user_id);
CREATE INDEX idx_ecg_readings_timestamp ON public.ecg_readings(reading_timestamp DESC);
CREATE INDEX idx_hospitals_location ON public.hospitals(latitude, longitude);
CREATE INDEX idx_emergency_alerts_user ON public.emergency_alerts(user_id);
CREATE INDEX idx_emergency_alerts_status ON public.emergency_alerts(status);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecg_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for emergency_contacts
CREATE POLICY "Users can view own contacts" ON public.emergency_contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own contacts" ON public.emergency_contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own contacts" ON public.emergency_contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own contacts" ON public.emergency_contacts FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for devices
CREATE POLICY "Users can view own devices" ON public.devices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own devices" ON public.devices FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own devices" ON public.devices FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own devices" ON public.devices FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for ecg_readings
CREATE POLICY "Users can view own readings" ON public.ecg_readings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own readings" ON public.ecg_readings FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for hospitals (public read)
CREATE POLICY "Anyone can view hospitals" ON public.hospitals FOR SELECT USING (true);

-- RLS Policies for emergency_alerts
CREATE POLICY "Users can view own alerts" ON public.emergency_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own alerts" ON public.emergency_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own alerts" ON public.emergency_alerts FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for alert_notifications
CREATE POLICY "Users can view notifications for own alerts" ON public.alert_notifications FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.emergency_alerts WHERE id = alert_id AND user_id = auth.uid()));

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for profiles updated_at
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable realtime for ECG readings
ALTER PUBLICATION supabase_realtime ADD TABLE public.ecg_readings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_alerts;

-- Insert sample hospitals (you can add more)
INSERT INTO public.hospitals (name, address, phone_number, latitude, longitude, has_ambulance, has_cardiac_unit, is_multi_facility) VALUES
('City General Hospital', '123 Medical Center Dr', '+1-555-0101', 40.7128, -74.0060, true, true, true),
('Metro Heart Center', '456 Cardiac Ave', '+1-555-0102', 40.7580, -73.9855, true, true, true),
('Regional Medical Center', '789 Health Blvd', '+1-555-0103', 40.7489, -73.9680, true, true, true),
('University Hospital', '321 Academic Way', '+1-555-0104', 40.7295, -73.9965, true, true, true),
('Emergency Care Center', '654 First Response St', '+1-555-0105', 40.7614, -73.9776, true, true, true);