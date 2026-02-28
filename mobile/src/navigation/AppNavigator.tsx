import { useEffect, useState } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuthStore } from '../store/authStore';
import { useNetworkListener } from '../store/networkStore';
import { connectSocket, onFriendRequest, onInvitation } from '../services/socket';
import { useResponsive } from '../hooks/use-responsive';
import { useTheme } from '../theme/theme-context';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import EmailVerificationScreen from '../screens/EmailVerificationScreen';
import HomeScreen from '../screens/HomeScreen';
import CreateEventScreen from '../screens/CreateEventScreen';
import CreatePlaylistScreen from '../screens/CreatePlaylistScreen';
import EventScreen from '../screens/EventScreen';
import PlaylistScreen from '../screens/PlaylistScreen';
import ProfileScreen from '../screens/ProfileScreen';
import FriendsScreen from '../screens/FriendsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import UserProfileScreen from '../screens/UserProfileScreen';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
  EmailVerification: { email: string };
  MainTabs: undefined;
  CreateEvent: undefined;
  CreatePlaylist: undefined;
  Event: { eventId: string };
  Playlist: { playlistId: string };
  UserProfile: { userId: string };
};

export type TabParamList = {
  Home: undefined;
  Friends: undefined;
  Notifications: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

type SidebarTab = { key: keyof TabParamList; label: string; icon: keyof typeof Ionicons.glyphMap };

const SIDEBAR_TABS: SidebarTab[] = [
  { key: 'Home', label: 'Accueil', icon: 'home-outline' },
  { key: 'Friends', label: 'Amis', icon: 'people-outline' },
  { key: 'Notifications', label: 'Notifications', icon: 'notifications-outline' },
  { key: 'Profile', label: 'Profil', icon: 'person-outline' },
];

const TAB_SCREENS: Record<keyof TabParamList, () => JSX.Element> = {
  Home: HomeScreen,
  Friends: FriendsScreen,
  Notifications: NotificationsScreen,
  Profile: ProfileScreen,
};

// Desktop sidebar layout — replaces bottom tabs on wide screens
function DesktopSidebar({ notifCount, onNotifReset }: { notifCount: number; onNotifReset: () => void }) {
  const [activeTab, setActiveTab] = useState<keyof TabParamList>('Home');
  const { colors } = useTheme();
  const ActiveScreen = TAB_SCREENS[activeTab];

  const handleTabPress = (key: keyof TabParamList) => {
    if (key === 'Notifications') onNotifReset();
    setActiveTab(key);
  };

  return (
    <View style={sidebarStyles.container}>
      <View style={sidebarStyles.sidebar}>
        <Text style={sidebarStyles.logo}>Music Room</Text>
        {SIDEBAR_TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[sidebarStyles.sidebarItem, isActive && { backgroundColor: colors.primaryLight }]}
              onPress={() => handleTabPress(tab.key)}
            >
              <Ionicons
                name={tab.icon}
                size={22}
                color={isActive ? colors.primary : '#666'}
              />
              <Text style={[sidebarStyles.sidebarLabel, isActive && { color: colors.primary, fontWeight: '600' }]}>
                {tab.label}
              </Text>
              {tab.key === 'Notifications' && notifCount > 0 && (
                <View style={sidebarStyles.badge}>
                  <Text style={sidebarStyles.badgeText}>{notifCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={sidebarStyles.content}>
        <ActiveScreen />
      </View>
    </View>
  );
}

function MainTabs() {
  const [notifCount, setNotifCount] = useState(0);
  const { isDesktop } = useResponsive();
  const { colors } = useTheme();

  useNetworkListener();

  useEffect(() => {
    connectSocket();
    const unsubFriend = onFriendRequest(() => {
      setNotifCount(prev => prev + 1);
    });
    const unsubInvite = onInvitation(() => {
      setNotifCount(prev => prev + 1);
    });
    return () => { unsubFriend(); unsubInvite(); };
  }, []);

  if (isDesktop) {
    return (
      <DesktopSidebar
        notifCount={notifCount}
        onNotifReset={() => setNotifCount(0)}
      />
    );
  }

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#999',
        tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
        headerShown: true,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Music Room',
          tabBarLabel: 'Accueil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Friends"
        component={FriendsScreen}
        options={{
          title: 'Amis',
          tabBarLabel: 'Amis',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: 'Notifications',
          tabBarLabel: 'Notifs',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
          tabBarBadge: notifCount > 0 ? notifCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#ef4444', fontSize: 11 },
        }}
        listeners={{
          tabPress: () => setNotifCount(0),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Mon profil',
          tabBarLabel: 'Profil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { accessToken, isLoading, loadTokens } = useAuthStore();

  useEffect(() => {
    loadTokens();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {accessToken ? (
          <>
            <Stack.Screen
              name="MainTabs"
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen name="CreateEvent" component={CreateEventScreen} options={{ title: 'Nouvel evenement' }} />
            <Stack.Screen name="CreatePlaylist" component={CreatePlaylistScreen} options={{ title: 'Nouvelle playlist' }} />
            <Stack.Screen name="Event" component={EventScreen} options={{ title: 'Evenement' }} />
            <Stack.Screen name="Playlist" component={PlaylistScreen} />
            <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: 'Profil' }} />
            <Stack.Screen name="EmailVerification" component={EmailVerificationScreen} options={{ title: 'Verification' }} />
          </>
        ) : (
          <>
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Register"
              component={RegisterScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ForgotPassword"
              component={ForgotPasswordScreen}
              options={{ title: 'Mot de passe oublie' }}
            />
            <Stack.Screen
              name="ResetPassword"
              component={ResetPasswordScreen}
              options={{ title: 'Reinitialiser' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const sidebarStyles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 240,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#e5e5e5',
    paddingTop: 20,
    paddingHorizontal: 12,
  },
  logo: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    paddingHorizontal: 12,
    paddingBottom: 24,
    paddingTop: 8,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    gap: 12,
  },
  sidebarLabel: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
    flex: 1,
  },
  badge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
});
