import { useEffect } from 'react';
import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';

interface NetworkState {
  isConnected: boolean;
  setConnected: (value: boolean) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  isConnected: true,
  setConnected: (value) => set({ isConnected: value }),
}));

// Hook to subscribe to network changes
export function useNetworkListener() {
  const setConnected = useNetworkStore(s => s.setConnected);

  useEffect(() => {
    NetInfo.fetch().then(state => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      setConnected(online);
    });

    const unsubscribe = NetInfo.addEventListener(state => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      setConnected(online);
    });

    return () => unsubscribe();
  }, [setConnected]);
}
