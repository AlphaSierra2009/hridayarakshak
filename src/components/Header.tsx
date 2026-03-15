import { useState } from "react";
import { Menu, X } from "lucide-react";
import { NavLink } from "./NavLink";
import EmergencyTrigger from "./EmergencyTrigger";
import { supabase } from "@/integrations/supabase/client";

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="w-full bg-card border-b border-border glass sticky top-0 z-40 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <div className="relative flex items-center gap-3">
              <div className="flex flex-col leading-none">
                <span className="text-sm text-muted-foreground">हृदय रक्षक</span>
                <span className="text-lg font-semibold tracking-tight gradient-text">HRIDAYARAKSHAK</span>
              </div>
              <div className="hidden md:flex items-center ml-4 p-1 rounded-md bg-background/40 border border-border">
                <nav className="flex items-center gap-2" aria-label="Main navigation">
                  <NavLink to="/" className="text-sm">Dashboard</NavLink>
                  <NavLink to="/arduino" className="text-sm">Device</NavLink>
                  <NavLink to="/hospitals" className="text-sm">Hospitals</NavLink>
                  <NavLink to="/alerts" className="text-sm">Alerts</NavLink>
                </nav>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-3">
              <EmergencyTrigger />
              <button className="btn btn-sm">Analyze</button>
              {typeof (supabase as any).__mock !== "undefined" && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      try {
                        (supabase as any).__mock.__emit("alerts-channel", {
                          eventType: "INSERT",
                          new: {
                            id: `mock-${Date.now()}`,
                            alert_type: "STEMI",
                            stemi_level: 2,
                            triggered_at: new Date().toISOString(),
                          },
                        });
                      } catch (e) {
                        console.warn("Failed to emit mock alert", e);
                      }
                    }}
                    className="btn btn-sm bg-yellow-600 text-black"
                    title="Emit mock alert to realtime channel"
                  >
                    Emit Mock Alert
                  </button>

                  <button
                    onClick={() => {
                      try {
                        (supabase as any).__mock.__emit("alerts-channel", {
                          eventType: "INSERT",
                          new: {
                            id: `mock-contact-${Date.now()}`,
                            alert_type: "TEST",
                            stemi_level: 0,
                            triggered_at: new Date().toISOString(),
                          },
                        });
                      } catch (e) {
                        console.warn("Failed to emit mock test event", e);
                      }
                    }}
                    className="btn btn-sm bg-muted"
                    title="Emit mock test event"
                  >
                    Emit Mock Event
                  </button>
                </div>
              )}
            </div>

            {/* Profile / status */}
            <div className="flex items-center gap-3">
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-semibold shadow-sm">HR</div>
              </div>
            </div>

            <button
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="p-2 rounded-md hover:bg-background/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary md:hidden"
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-card border-t border-border">
          <div className="px-4 pt-2 pb-4 space-y-1">
            <div className="mb-2">
              <EmergencyTrigger />
            </div>
            <NavLink to="/" className="block w-full">Dashboard</NavLink>
            <NavLink to="/arduino" className="block w-full">Device</NavLink>
            <NavLink to="/hospitals" className="block w-full">Hospitals</NavLink>
          </div>
        </div>
      )}
    </header>
  );
}
