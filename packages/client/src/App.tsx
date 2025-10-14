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
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      {user ? (
        <GameCanvas />
      ) : (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
          <div className="text-center px-4">
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 tracking-tight">
              Smuggler's Town
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 mb-12">
              Geo-CTF Racer
            </p>
            <button
              onClick={handleSignIn}
              className="group relative px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white text-lg font-semibold rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 ease-in-out"
            >
              <span className="flex items-center gap-2">
                Play as Guest
                <svg
                  className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
            </button>
            <p className="text-gray-500 text-sm mt-8">
              Click to start playing
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
