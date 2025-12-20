import { useState } from "react";
import { Menu, X } from "lucide-react";
import { NavLink } from "./NavLink";
import EmergencyTrigger from "./EmergencyTrigger";

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="w-full bg-neutral-900 border-b border-gray-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <div className="text-lg font-semibold">Heartbeat Navigator</div>
            <nav className="hidden md:flex items-center gap-2" aria-label="Main navigation">
              <NavLink to="/" className="text-sm">Dashboard</NavLink>
              <NavLink to="/arduino" className="text-sm">Device</NavLink>
              <NavLink to="/hospitals" className="text-sm">Hospitals</NavLink>
              <NavLink to="/alerts" className="text-sm">Alerts</NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <EmergencyTrigger />
              <button className="btn btn-sm">Analyze</button>
            </div>
            <button
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="p-2 rounded-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary md:hidden"
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-neutral-900 border-t border-gray-800">
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
