import type { NavigatorScreenParams } from "@react-navigation/native";

export type TabsParamList = {
  Home: undefined;
  Search: undefined;
  Scan: { setNum?: string | null } | undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabsParamList> | undefined;
  SetDetail: { setNum: string };
};
