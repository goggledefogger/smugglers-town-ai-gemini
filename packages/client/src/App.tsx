import { useState, useEffect } from 'react';
import { auth } from './firebaseConfig';
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { GameCanvas } from './features/GameCanvas';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    if (!user) {
      try {
        await signInAnonymously(auth);
        console.log('Signed in anonymously');
      } catch (error) {
        console.error("Anonymous sign-in failed: ", error);
      }
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      {user ? (
        <GameCanvas />
      ) : (
        <div style={{ padding: '20px'}}>
          <h1>Smuggler's Town (Geo-CTF Racer)</h1>
          <button onClick={handleSignIn}>Play as Guest</button>
        </div>
      )}
    </div>
  );
}

export default App;
