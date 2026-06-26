import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Text } from "react-native";

import type { RootStackParamList, TabsParamList } from "@/navigation";
import HomeScreen from "@/screens/HomeScreen";
import ScanScreen from "@/screens/ScanScreen";
import SetDetailScreen from "@/screens/SetDetailScreen";
import SetSearchScreen from "@/screens/SetSearchScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import { theme } from "@/theme";

const Tab = createBottomTabNavigator<TabsParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: theme.bg,
    card: theme.card,
    border: theme.border,
    text: theme.text,
    primary: theme.accent,
  },
};

function tabIcon(label: string) {
  return ({ color }: { color: string }) => (
    <Text style={{ color, fontSize: 18 }}>{label}</Text>
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.card },
        headerTintColor: theme.text,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textFaint,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "My sets", tabBarIcon: tabIcon("🧱") }} />
      <Tab.Screen name="Search" component={SetSearchScreen} options={{ title: "Find set", tabBarIcon: tabIcon("🔎") }} />
      <Tab.Screen name="Scan" component={ScanScreen} options={{ title: "Scan", tabBarIcon: tabIcon("📷") }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: tabIcon("⚙️") }} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.card },
          headerTintColor: theme.text,
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="SetDetail" component={SetDetailScreen} options={{ title: "Set" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
