import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Cpu, Wifi, WifiOff, Copy, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


interface DeviceConnectionProps {
  devices: Device[];
  onDevicesChange: () => void;
  userId?: string;
}

const DeviceConnection = ({ devices, onDevicesChange, userId }: DeviceConnectionProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState("");

  const generateToken = () => {
    return `ecg_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
  };

  const handleAddDevice = async () => {
    if (!userId) {
      toast.error("Please sign in to add devices");
      return;
    }

    if (!newDeviceName) {
      toast.error("Device name is required");
      return;
    }

    const { error } = await supabase.from("devices").insert({
      user_id: userId,
      device_name: newDeviceName,
      device_token: generateToken(),
      is_active: true,
    });

    if (error) {
      toast.error("Failed to add device");
      console.error(error);
    } else {
      toast.success("Device added! Copy the token for your Arduino.");
      setNewDeviceName("");
      setIsAdding(false);
      onDevicesChange();
    }
  };

  const handleDeleteDevice = async (id: string) => {
    const { error } = await supabase.from("devices").delete().eq("id", id);

    if (error) {
      toast.error("Failed to delete device");
    } else {
      toast.success("Device deleted");
      onDevicesChange();
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast.success("Token copied to clipboard");
  };

  const isRecentlyActive = (lastSeen?: string) => {
    if (!lastSeen) return false;
    const diff = Date.now() - new Date(lastSeen).getTime();
    return diff < 60000; // Active within last minute
  };

  return (
    <Card className="bg-card border-border glass soft-shadow transition-all p-6 text-center">
      <CardHeader>
        <CardTitle className="text-foreground gradient-text flex items-center gap-2 justify-center">
          <Cpu className="h-5 w-5 text-primary" />
          Connect Arduino
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Click the button below to connect your Arduino using WebSerial.
        </p>

        <Button
          size="sm"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg soft-shadow hover-lift transition-all"
          onClick={async () => {
            try {
              const port = await navigator.serial.requestPort();
              await port.open({ baudRate: 9600 });
              const reader = port.readable.getReader();

              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                console.log(new TextDecoder().decode(value));
              }
            } catch (err) {
              console.error("Arduino connection failed:", err);
            }
          }}
        >
          Connect Arduino
        </Button>
      </CardContent>
    </Card>
  );
};

export default DeviceConnection;
