export enum FuelType {
  GASOLINE = 'Gasoline',
  DIESEL = 'Diesel',
  ELECTRIC = 'Electric',
  HYBRID = 'Hybrid'
}

export enum LogType {
  FUEL = 'Fuel',
  SERVICE = 'Service',
  EXPENSE = 'Expense'
}

export interface Reminder {
  id: string;
  vehicleId: string;
  serviceType: string;
  dueOdometer?: number;
  dueDate?: string;
  note?: string;
  isDismissed: boolean;
  logId?: string; // Links reminder to the specific log that created it
}

export interface Vehicle {
  id: string;
  name: string;
  make: string;
  model: string;
  year: number;
  fuelType: FuelType;
  currentOdometer: number;
  licensePlate?: string;
  tankCapacity?: number;
  defaultOctane?: number;
  reminders?: Reminder[];
  distanceUnit?: 'km' | 'mi';
}

export interface LogEntry {
  id: string;
  vehicleId: string;
  type: LogType;
  date: string;
  odometer: number;
  cost: number;
  notes?: string;
  // Fuel specific
  liters?: number;
  pricePerLiter?: number;
  fullTank?: boolean;
  station?: string;
  fuelGrade?: string;
  tankPercentage?: number;
  // Service specific
  serviceType?: string;
  partsDetails?: string;
}

export interface FavoritePlace {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  type: 'fuel' | 'mechanic' | 'other';
}

export interface User {
  id: string;
  email: string;
  name: string;
  photoURL?: string;
  phoneNumber?: string;
  country: string;
  currency: string;
  distanceUnit: 'km' | 'mi';
  fuelUnit: 'liter' | 'gallon';
  // App Preferences
  theme?: 'dark' | 'light';
  notificationsEnabled?: boolean;
  backupFrequency?: 'daily' | 'weekly' | 'manual';
  // Backup Settings
  googleDriveConnected?: boolean;
  autoBackupEnabled?: boolean;
  lastBackupDate?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}