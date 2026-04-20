/**
 * App.js — Main application entry point with React Navigation
 *
 * Navigation stack:
 *   Login → Dashboard → Survey
 *
 * All screens use the same dark theme (1A1A2E background)
 * to match the web application's design language.
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import SurveyScreen from './src/screens/SurveyScreen';

const Stack = createNativeStackNavigator();

export default function App() {
    return (
        <NavigationContainer>
            <Stack.Navigator
                initialRouteName="Login"
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: '#1A1A2E' },
                    animation: 'slide_from_right',
                }}
            >
                <Stack.Screen name="Login" component={LoginScreen} />
                <Stack.Screen name="Dashboard" component={DashboardScreen} />
                <Stack.Screen name="Survey" component={SurveyScreen} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
