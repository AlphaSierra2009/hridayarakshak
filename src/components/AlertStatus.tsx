import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Bell, CheckCircle, Clock, XCircle, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Alert {
  id: string;
  alert_type: string;
  status: string;
  triggered_at: string;
  latitude?: number;
  longitude?: number;
}

interface AlertStatusProps {
  alerts: Alert[];
  onAlertsChange: () => void;
}

const AlertStatus = ({ alerts, onAlertsChange }: AlertStatusProps) => {
  const activeAlerts = alerts.filter((a) => a.status !== "resolved");
  const hasActiveAlert = activeAlerts.length > 0;

  const resolveAlert = async (alertId: string) => {
    const { error } = await supabase
      .from("emergency_alerts")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", alertId);

    if (error) {
      toast.error("Failed to resolve alert");
    } else {
      toast.success("Alert resolved");
      onAlertsChange();
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "triggered":
      case "pending":
        return <AlertTriangle className="h-4 w-4" />;
      case "notified":
        return <Bell className="h-4 w-4" />;
      case "resolved":
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "triggered":
      case "pending":
        return "bg-emergency text-emergency-foreground emergency-pulse";
      case "notified":
        return "bg-warning text-warning-foreground";
      case "resolved":
        return "bg-success text-success-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Card className={`bg-card border-border glass soft-shadow hover-lift transition-all ${hasActiveAlert ? "border-emergency strong-shadow" : ""}`}>
      <CardHeader className="pb-2 fade-in">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-foreground gradient-text">
            <AlertTriangle className={`h-5 w-5 ${hasActiveAlert ? "text-emergency" : "text-muted-foreground"}`} />
            Alert Status
          </CardTitle>
          {hasActiveAlert && (
            <Badge className="bg-emergency text-emergency-foreground emergency-pulse">
              {activeAlerts.length} Active
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {hasActiveAlert && (
          <div className="mb-4 p-3 rounded-lg bg-emergency/10 border border-emergency/30 soft-shadow glass fade-in">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-emergency" />
              <span className="font-semibold text-emergency">Emergency Alert Active</span>
            </div>
            <p className="text-sm text-foreground mb-3">
              ST elevation detected. Hospitals and emergency contacts are being notified.
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="bg-emergency hover:bg-emergency/90">
                <Phone className="h-3 w-3 mr-1" />
                Call 911
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => activeAlerts[0] && resolveAlert(activeAlerts[0].id)}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Mark Resolved
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2 max-h-48 overflow-y-auto fade-in">
          {alerts.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle className="h-8 w-8 text-success mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No alerts. All clear!</p>
            </div>
          ) : (
            alerts.slice(0, 5).map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover-lift soft-shadow transition-all"
              >
                <div className="flex items-center gap-2">
                  <Badge className={`${getStatusColor(alert.status)} text-xs`}>
                    {getStatusIcon(alert.status)}
                    <span className="ml-1 capitalize">{alert.status}</span>
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(alert.triggered_at).toLocaleString()}
                  </span>
                </div>
                {alert.status !== "resolved" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => resolveAlert(alert.id)}
                  >
                    Resolve
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AlertStatus;
