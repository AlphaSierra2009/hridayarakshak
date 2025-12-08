import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, Phone, Plus, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Contact {
  id: string;
  name: string;
  phone_number: string;
  relationship?: string;
  priority: number;
}

interface EmergencyContactsProps {
  contacts: Contact[];
  onContactsChange: () => void;
  userId?: string;
}

const EmergencyContacts = ({ contacts, onContactsChange, userId }: EmergencyContactsProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newContact, setNewContact] = useState({
    name: "",
    phone_number: "",
    relationship: "",
  });

  const handleAdd = async () => {
    if (!userId) {
      toast.error("Please sign in to add contacts");
      return;
    }

    if (!newContact.name || !newContact.phone_number) {
      toast.error("Name and phone number are required");
      return;
    }

    const { error } = await supabase.from("emergency_contacts").insert({
      user_id: userId,
      name: newContact.name,
      phone_number: newContact.phone_number,
      relationship: newContact.relationship || null,
      priority: contacts.length + 1,
    });

    if (error) {
      toast.error("Failed to add contact");
      console.error(error);
    } else {
      toast.success("Contact added");
      setNewContact({ name: "", phone_number: "", relationship: "" });
      setIsAdding(false);
      onContactsChange();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("emergency_contacts").delete().eq("id", id);

    if (error) {
      toast.error("Failed to delete contact");
    } else {
      toast.success("Contact deleted");
      onContactsChange();
    }
  };

  return (
    <Card className="bg-card border-border glass soft-shadow hover-lift transition-all">
      <CardHeader className="pb-2 fade-in">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-foreground gradient-text">
            <Users className="h-5 w-5 text-primary" />
            Emergency Contacts
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAdding(!isAdding)}
            className="text-xs"
          >
            <UserPlus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isAdding && (
          <div className="mb-4 p-3 rounded-lg bg-muted/50 space-y-2 soft-shadow glass fade-in">
            <Input
              placeholder="Name"
              value={newContact.name}
              onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
              className="h-8 text-sm"
            />
            <Input
              placeholder="Phone Number"
              value={newContact.phone_number}
              onChange={(e) => setNewContact({ ...newContact, phone_number: e.target.value })}
              className="h-8 text-sm"
            />
            <Input
              placeholder="Relationship (optional)"
              value={newContact.relationship}
              onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })}
              className="h-8 text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} className="flex-1">
                <Plus className="h-3 w-3 mr-1" />
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsAdding(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2 max-h-48 overflow-y-auto fade-in">
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No emergency contacts added
            </p>
          ) : (
            contacts.map((contact, index) => (
              <div
                key={contact.id}
                className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 group hover-lift soft-shadow transition-all"
              >
                <Badge variant="outline" className="w-6 h-6 rounded-full flex items-center justify-center p-0">
                  {index + 1}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{contact.name}</p>
                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${contact.phone_number}`}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Phone className="h-3 w-3" />
                      {contact.phone_number}
                    </a>
                    {contact.relationship && (
                      <span className="text-xs text-muted-foreground">
                        • {contact.relationship}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                  onClick={() => handleDelete(contact.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          These contacts will be notified during emergencies
        </p>
      </CardContent>
    </Card>
  );
};

export default EmergencyContacts;
