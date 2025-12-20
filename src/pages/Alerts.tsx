import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip } from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("emergency_alerts")
        .select("id,user_id,alert_type,status,triggered_at,notes,stemi_level,reading_snapshot,is_test,latitude,longitude")
        .order("triggered_at", { ascending: false })
        .limit(50);
      if (data) setAlerts(data as any[]);
    })();
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h2 className="text-2xl font-semibold mb-4">Emergency Alerts</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          {alerts.map((a) => (
            <Card key={a.id} className="p-3 mb-2 cursor-pointer" onClick={() => setSelected(a)}>
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold">{a.alert_type} {a.is_test ? '(test)' : ''}</div>
                  <div className="text-xs text-muted-foreground">{new Date(a.triggered_at).toLocaleString()}</div>
                </div>
                <div className="text-sm text-foreground/70">{a.status}</div>
              </div>
            </Card>
          ))}
        </div>

        <div className="md:col-span-2">
          {selected ? (
            <Card className="p-4">
              <h3 className="font-semibold">Alert details</h3>
              <div className="mt-2 text-sm">Type: {selected.alert_type} {selected.is_test && '(test)'}</div>
              <div className="mt-1 text-sm">STEMI value: {selected.stemi_level ?? 'N/A'}</div>
              <div className="mt-1 text-sm">Notes: {selected.notes ?? "-"}</div>
              <div className="mt-3">
                {selected.reading_snapshot ? (
                  <>
                    <Line
                      data={{ labels: (selected.reading_snapshot as number[]).map((_, i) => i), datasets: [{ data: selected.reading_snapshot, borderColor: 'hsl(var(--destructive))', fill: false, pointRadius: 0 }] }}
                      options={{ responsive: true, plugins: { tooltip: { enabled: false } }, scales: { x: { display: false } } }}
                    />
                    <div className="mt-2 flex gap-2">
                      <a className="btn" href={`data:text/csv;charset=utf-8,${encodeURIComponent((selected.reading_snapshot as number[]).join('\n'))}`} download={`alert_${selected.id}_reading.csv`}>Download CSV</a>
                      <button className="btn" onClick={() => alert('Run scripts/generate_alert_plot.py locally on the CSV to create a matplotlib PNG for presentations.')}>Generate matplotlib PNG (local)</button>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">No reading snapshot available for this alert.</div>
                )}
              </div>
            </Card>
          ) : (
            <div className="text-muted-foreground p-4">Select an alert to view details and reading snapshot.</div>
          )}
        </div>
      </div>
    </div>
  );
}
