import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface UserContextType {
  username: string | null;
  setUsername: (name: string) => void;
  clearUsername: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [username, setUsernameState] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("hridaya_rakshak_username");
    if (saved) {
      setUsernameState(saved);
    }
  }, []);

  const setUsername = (name: string) => {
    localStorage.setItem("hridaya_rakshak_username", name);
    setUsernameState(name);
  };

  const clearUsername = () => {
    localStorage.removeItem("hridaya_rakshak_username");
    setUsernameState(null);
    window.location.reload();
  };

  return (
    <UserContext.Provider value={{ username, setUsername, clearUsername }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within UserProvider");
  }
  return context;
};
