import React, { useState, useEffect } from 'react';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { Assistant } from './components/Assistant';
import { UserProfile } from './components/UserProfile';
import { Garage } from './components/Garage';
import { Navigation } from './components/Navigation';
import { Icons } from './components/Icons';
import { AddLogModal } from './components/AddLogModal';
import { User, Vehicle, LogEntry, Reminder } from './types';
import { StorageService } from './services/storageService';
import { AuthService } from './services/authService';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dash' | 'nav' | 'ai' | 'vehicles' | 'profile'>('dash');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [currentVehicle, setCurrentVehicle] = useState<Vehicle | undefined>(undefined);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLog, setEditingLog] = useState<LogEntry | undefined>(undefined);

  // Initial Load (Session Check)
  useEffect(() => {
    const unsubscribe = AuthService.observeSession((loadedUser) => {
      if (loadedUser) {
        setUser(loadedUser);
        applyTheme(loadedUser.theme);
      } else {
        setUser(null);
        applyTheme('dark');
      }
      setLoadingUser(false);
    });

    return () => unsubscribe();
  }, []);

  const applyTheme = (theme?: 'dark' | 'light') => {
      if (theme === 'light') {
          document.documentElement.classList.remove('dark');
      } else {
          document.documentElement.classList.add('dark');
      }
  };

  // Load Data when User changes
  useEffect(() => {
    if (user) {
        loadUserData(user.id);
    }
  }, [user]);

  const loadUserData = async (userId: string) => {
    setDataLoading(true);
    try {
        const v = await StorageService.getVehicles(userId);
        setVehicles(v);
        
        let targetVehicle = currentVehicle;
        
        if (v.length > 0) {
            // If current vehicle not set or not in new list, pick first
            if (!targetVehicle || !v.find(veh => veh.id === targetVehicle?.id)) {
                targetVehicle = v[0];
            }
            setCurrentVehicle(targetVehicle);
            
            // Load logs for target
            const l = await StorageService.getLogs(userId, targetVehicle.id);
            setLogs(l);
        } else {
            setLogs([]);
            setCurrentVehicle(undefined);
        }
    } catch (e) {
        console.error("Failed to load data", e);
    } finally {
        setDataLoading(false);
    }
  };

  const handleLogin = (newUser: User) => {
    setUser(newUser);
  };

  const handleLogout = async () => {
    await AuthService.logout();
    setUser(null);
    setVehicles([]);
    setLogs([]);
    setActiveTab('dash');
    applyTheme('dark');
  };

  const handleDeleteAccount = async () => {
      if (!user) return;
      alert("Please contact admin to delete account data for now.");
  };

  const handleAddLog = async (log: LogEntry, newReminders?: Reminder[]) => {
    if (!user || !currentVehicle) return;
    
    // 1. Save the new log and get real ID from DB
    const savedLogId = await StorageService.saveLog(log, user.id);

    // 2. Fetch all logs for this vehicle to find the true max odometer
    const allLogs = await StorageService.getLogs(user.id, currentVehicle.id);
    setLogs(allLogs); // Update state

    // 3. Determine max odometer
    let maxOdo = currentVehicle.currentOdometer;
    allLogs.forEach(l => {
        if (l.odometer > maxOdo) maxOdo = l.odometer;
    });

    // 4. Update vehicle if needed (odometer changed or reminders added)
    const hasOdoChange = maxOdo > currentVehicle.currentOdometer;
    const hasReminders = newReminders && newReminders.length > 0;

    if (hasOdoChange || hasReminders) {
        let updatedVehicle = { ...currentVehicle };
        
        if (hasOdoChange) {
            updatedVehicle.currentOdometer = maxOdo;
        }

        if (hasReminders && savedLogId) {
            const existing = updatedVehicle.reminders || [];
            // Assign the confirmed Log ID to the reminders
            const linkedReminders = newReminders!.map(r => ({ ...r, logId: savedLogId }));
            updatedVehicle.reminders = [...existing, ...linkedReminders];
        }

        await StorageService.saveVehicle(updatedVehicle, user.id);
        
        // Refresh vehicles list
        const v = await StorageService.getVehicles(user.id);
        setVehicles(v);
        
        // Update current vehicle reference
        const freshCurrent = v.find(veh => veh.id === updatedVehicle.id);
        if (freshCurrent) setCurrentVehicle(freshCurrent);
    }
  };

  const handleDeleteLog = async (id: string) => {
      if (!user) return;
      await StorageService.deleteLog(id, user.id);
      
      if (currentVehicle) {
          const updatedLogs = await StorageService.getLogs(user.id, currentVehicle.id);
          setLogs(updatedLogs);

          let updatedVehicle = { ...currentVehicle };
          let vehicleChanged = false;

          // 1. Remove associated reminders (Cascade Delete)
          if (updatedVehicle.reminders) {
              const originalCount = updatedVehicle.reminders.length;
              const filteredReminders = updatedVehicle.reminders.filter(r => r.logId !== id);
              if (filteredReminders.length !== originalCount) {
                  updatedVehicle.reminders = filteredReminders;
                  vehicleChanged = true;
              }
          }

          // 2. Update Vehicle Odometer based on remaining logs
          // If we deleted the log with the highest odometer, we should revert the vehicle odometer to the next highest.
          if (updatedLogs.length > 0) {
              const maxLogOdo = Math.max(...updatedLogs.map(l => l.odometer));
              
              if (maxLogOdo !== updatedVehicle.currentOdometer) {
                   updatedVehicle.currentOdometer = maxLogOdo;
                   vehicleChanged = true;
              }
          }

          if (vehicleChanged) {
              await StorageService.saveVehicle(updatedVehicle, user.id);
              setVehicles(prev => prev.map(v => v.id === updatedVehicle.id ? updatedVehicle : v));
              setCurrentVehicle(updatedVehicle);
          }
      }
  };
  
  const handleEditLog = (log: LogEntry) => {
      setEditingLog(log);
      setShowAddModal(true);
  };

  const handleDismissReminder = async (reminderId: string) => {
      if (!user || !currentVehicle) return;
      
      // Permanently remove the reminder (delete) instead of just marking as dismissed
      const updatedReminders = currentVehicle.reminders?.filter(r => r.id !== reminderId) || [];
      const updatedVehicle = { ...currentVehicle, reminders: updatedReminders };
      
      setCurrentVehicle(updatedVehicle);
      setVehicles(prev => prev.map(v => v.id === updatedVehicle.id ? updatedVehicle : v));
      
      await StorageService.saveVehicle(updatedVehicle, user.id);
  };

  const handleUpdateUser = (updatedUser: User) => {
    setUser(updatedUser);
    applyTheme(updatedUser.theme);
  };

  const handleVehicleSelect = async (v: Vehicle) => {
      if (!user) return;
      setCurrentVehicle(v);
      setDataLoading(true);
      const l = await StorageService.getLogs(user.id, v.id);
      setLogs(l);
      setDataLoading(false);
  };

  const handleSaveVehicle = async (vehicle: Vehicle) => {
      if (!user) return;
      await StorageService.saveVehicle(vehicle, user.id);
      
      const updatedVehicles = await StorageService.getVehicles(user.id);
      setVehicles(updatedVehicles);
      
      // If first vehicle created, select it
      if (updatedVehicles.length === 1) {
          handleVehicleSelect(updatedVehicles[0]);
      } else if (currentVehicle && currentVehicle.name === vehicle.name) { 
          const found = updatedVehicles.find(uv => uv.name === vehicle.name && uv.make === vehicle.make); // approximate
          if (found) setCurrentVehicle(found);
      }
  };

  const handleDeleteVehicle = async (id: string) => {
      if (!user) return;
      await StorageService.deleteVehicle(id, user.id);
      const updatedVehicles = await StorageService.getVehicles(user.id);
      setVehicles(updatedVehicles);
      
      if (currentVehicle?.id === id) {
          if (updatedVehicles.length > 0) {
              handleVehicleSelect(updatedVehicles[0]);
          } else {
              setCurrentVehicle(undefined);
              setLogs([]);
          }
      }
  };

  if (loadingUser) {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <Icons.Refresh className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      );
  }

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex justify-center transition-colors duration-300">
      <div className="w-full max-w-md h-screen flex flex-col relative bg-white dark:bg-gray-900 shadow-2xl overflow-hidden transition-colors duration-300">
        
        {/* Top Header */}
        <header className="px-6 py-4 flex justify-between items-center bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-10 transition-colors duration-300">
          <div className="flex items-center space-x-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Icons.Car className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-gray-900 dark:text-white">MotoMate</span>
            {dataLoading && <Icons.Refresh className="w-3 h-3 animate-spin text-gray-500" />}
          </div>
          <div className="flex items-center space-x-3">
            {activeTab !== 'profile' && activeTab !== 'vehicles' && vehicles.length > 0 && (
                <button 
                    onClick={() => {
                        const currentIndex = vehicles.findIndex(v => v.id === currentVehicle?.id);
                        const nextIndex = (currentIndex + 1) % vehicles.length;
                        handleVehicleSelect(vehicles[nextIndex]);
                    }}
                    className="flex items-center space-x-1 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 pl-3 pr-2 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 transition"
                >
                    <span className="max-w-[80px] truncate text-gray-800 dark:text-gray-200">{currentVehicle?.name || 'Select'}</span>
                    <Icons.ChevronRight className="w-3 h-3 rotate-90 text-gray-500" />
                </button>
            )}
            {user.photoURL ? (
                <img 
                    src={user.photoURL} 
                    onClick={() => setActiveTab('profile')}
                    className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 cursor-pointer object-cover" 
                    alt="Profile"
                />
            ) : (
                <button onClick={() => setActiveTab('profile')} className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-white">
                    <Icons.Settings className="w-5 h-5" />
                </button>
            )}
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 scrollbar-hide">
          {activeTab === 'dash' && (
            <Dashboard 
              user={user}
              vehicle={currentVehicle} 
              logs={logs} 
              onAddLog={() => { setEditingLog(undefined); setShowAddModal(true); }}
              onEditLog={handleEditLog}
              onDeleteLog={handleDeleteLog}
              onDismissReminder={handleDismissReminder}
            />
          )}
          {activeTab === 'nav' && (
            <Navigation userId={user.id} />
          )}
          {activeTab === 'ai' && (
            <Assistant vehicle={currentVehicle} user={user} />
          )}
          {activeTab === 'vehicles' && (
            <Garage 
                vehicles={vehicles}
                currentVehicleId={currentVehicle?.id}
                onSelect={handleVehicleSelect}
                onSave={handleSaveVehicle}
                onDelete={handleDeleteVehicle}
            />
          )}
          {activeTab === 'profile' && (
            <UserProfile 
                user={user} 
                onUpdateUser={handleUpdateUser}
                onLogout={handleLogout}
                onDeleteAccount={handleDeleteAccount}
            />
          )}
        </main>

        {/* Floating Action Button */}
        {activeTab === 'dash' && currentVehicle && (
          <button 
            onClick={() => { setEditingLog(undefined); setShowAddModal(true); }}
            className="absolute bottom-24 right-4 bg-blue-600 hover:bg-blue-500 text-white p-4 rounded-full shadow-lg shadow-blue-900/50 transition-transform hover:scale-105 active:scale-95 z-20"
          >
            <Icons.Plus className="w-6 h-6" />
          </button>
        )}

        {/* Bottom Navigation */}
        <nav className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-lg border-t border-gray-200 dark:border-gray-700 px-2 py-3 flex justify-between items-center z-30 pb-safe transition-colors duration-300">
          <button 
            onClick={() => setActiveTab('dash')}
            className={`flex flex-col items-center w-1/5 space-y-1 ${activeTab === 'dash' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
          >
            <Icons.Stats className="w-6 h-6" />
            <span className="text-[10px] font-medium">Dash</span>
          </button>
          <button 
            onClick={() => setActiveTab('nav')}
            className={`flex flex-col items-center w-1/5 space-y-1 ${activeTab === 'nav' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
          >
            <Icons.Nav className="w-6 h-6" />
            <span className="text-[10px] font-medium">Nav</span>
          </button>
          <button 
            onClick={() => setActiveTab('ai')}
            className={`flex flex-col items-center w-1/5 space-y-1 ${activeTab === 'ai' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
          >
            <Icons.AI className="w-6 h-6" />
            <span className="text-[10px] font-medium">AI</span>
          </button>
          <button 
            onClick={() => setActiveTab('vehicles')}
            className={`flex flex-col items-center w-1/5 space-y-1 ${activeTab === 'vehicles' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
          >
            <Icons.Car className="w-6 h-6" />
            <span className="text-[10px] font-medium">Garage</span>
          </button>
          <button 
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center w-1/5 space-y-1 ${activeTab === 'profile' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
          >
            <Icons.User className="w-6 h-6" />
            <span className="text-[10px] font-medium">Profile</span>
          </button>
        </nav>

        {currentVehicle && user && (
            <AddLogModal 
                isOpen={showAddModal} 
                onClose={() => setShowAddModal(false)}
                onSave={handleAddLog}
                vehicle={currentVehicle}
                user={user}
                initialData={editingLog} // NEW: Pass the existing log for editing
            />
        )}
      </div>
    </div>
  );
}