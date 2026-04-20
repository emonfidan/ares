/**
 * DashboardScreen.js — Post-login dashboard
 *
 * Displays:
 *   - Welcome message with user name
 *   - "Take the Survey" button → navigates to the active survey
 *   - Logout button → returns to LoginScreen
 */

import React, { useState } from 'react';
import {
    View, Text, TouchableOpacity,
    StyleSheet, StatusBar, ActivityIndicator,
} from 'react-native';
import { fetchActiveSurveyId } from '../services/api';

const DashboardScreen = ({ route, navigation }) => {
    const { user } = route.params;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleTakeSurvey = async () => {
        setLoading(true);
        setError(null);
        try {
            const activeSurveyId = await fetchActiveSurveyId();
            if (!activeSurveyId) {
                setError('No active survey available at this time.');
                return;
            }
            navigation.navigate('Survey', { surveyId: activeSurveyId, user });
        } catch (err) {
            setError(err.message || 'Failed to load survey.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        navigation.replace('Login');
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#1A1A2E" />

            <View style={styles.content}>
                <Text style={styles.welcome} accessibilityLabel="welcome-text">
                    Welcome to ARES
                </Text>
                <Text style={styles.userName} accessibilityLabel="user-name">
                    {user?.name || user?.email || 'User'}
                </Text>
                <Text style={styles.subtitle}>
                    Adaptive Survey Ecosystem
                </Text>

                {error && (
                    <View style={styles.errorBox} accessibilityLabel="dashboard-error">
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                <TouchableOpacity
                    style={styles.surveyBtn}
                    onPress={handleTakeSurvey}
                    disabled={loading}
                    accessibilityLabel="take-survey-button"
                >
                    {loading ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Text style={styles.surveyBtnText}>📝 Take the Survey</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.logoutBtn}
                    onPress={handleLogout}
                    accessibilityLabel="logout-button"
                >
                    <Text style={styles.logoutBtnText}>Logout</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1A2E',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    content: {
        backgroundColor: '#16213E',
        borderRadius: 16,
        padding: 32,
        width: '100%',
        maxWidth: 400,
        alignItems: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    welcome: {
        fontSize: 14,
        color: '#A0AEC0',
        fontWeight: '600',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    userName: {
        fontSize: 28,
        fontWeight: '800',
        color: '#FFF',
        marginTop: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 12,
        color: '#718096',
        marginTop: 4,
        marginBottom: 24,
    },
    errorBox: {
        backgroundColor: '#FED7D7',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
        width: '100%',
    },
    errorText: {
        color: '#C53030',
        fontSize: 13,
        textAlign: 'center',
    },
    surveyBtn: {
        backgroundColor: '#6C63FF',
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 32,
        width: '100%',
        alignItems: 'center',
        marginBottom: 12,
    },
    surveyBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '700',
    },
    logoutBtn: {
        paddingVertical: 12,
        paddingHorizontal: 32,
    },
    logoutBtnText: {
        color: '#A0AEC0',
        fontSize: 14,
        fontWeight: '600',
    },
});

export default DashboardScreen;
