import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuthStore } from '../store/authStore';
import { connectSocket, onFriendRequest, onInvitation } from '../services/socket';
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

function MainTabs() {
  const [notifCount, setNotifCount] = useState(0);

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

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#4f46e5',
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
