import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useLocation } from "@/hooks/useLocation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function EmergencyTrigger() {
  const { location } = useLocation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");

  const trigger = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("trigger-emergency", {
        body: {
          alert_type: "manual",
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          notes,
          is_test: true
        }
      });

      if (error) throw error;
      const resp = data;

      setLoading(false);
      setOpen(false);
      toast.success("Emergency triggered. Help is being notified.");
      console.log("trigger response", resp);
    } catch (err: any) {
      setLoading(false);
      console.error(err);
      toast.error(err?.message || "Failed to trigger emergency");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div>
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)} className="hover-lift">
          Trigger Emergency
        </Button>
      </div>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trigger Emergency</DialogTitle>
          <DialogDescription>
            This will notify nearby hospitals and your emergency contacts via SMS/WhatsApp (if configured). Are you sure you want to proceed?
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <label className="text-sm block mb-1">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full p-2 bg-card border rounded" rows={3} />
          <div className="text-sm text-muted-foreground mt-2">Location: {location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : "Not available"}</div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={trigger} disabled={loading} className="ml-2">{loading ? "Triggering…" : "Trigger Emergency"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
