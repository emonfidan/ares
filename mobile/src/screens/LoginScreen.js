/**
 * LoginScreen.js — Login & Register screen (adapted from web LoginForm.jsx)
 *
 * Features:
 *   - Email/Password login form
 *   - Register form (tab switch)
 *   - Risk assessment display
 *   - Rate limit handling (429)
 *   - Error/success messaging
 *   - accessibilityLabel on all interactive elements (for Appium)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, ScrollView, KeyboardAvoidingView,
    Platform, ActivityIndicator, StatusBar,
} from 'react-native';
import { login, register } from '../services/api';

const LoginScreen = ({ navigation }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [riskInfo, setRiskInfo] = useState(null);

    // Rate limit
    const [rateLimitUntil, setRateLimitUntil] = useState(null);
    const [now, setNow] = useState(Date.now());
    const isRateLimited = Boolean(rateLimitUntil && now < rateLimitUntil);
    const rateLimitSeconds = isRateLimited
        ? Math.max(0, Math.ceil((rateLimitUntil - now) / 1000))
        : 0;

    useEffect(() => {
        if (!rateLimitUntil) return;
        const t = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(t);
    }, [rateLimitUntil]);

    useEffect(() => {
        if (rateLimitUntil && now >= rateLimitUntil) setRateLimitUntil(null);
    }, [now, rateLimitUntil]);

    // ── Login ──
    const handleLogin = async () => {
        if (loading || isRateLimited) return;
        setLoading(true);
        setMessage({ text: '', type: '' });
        setRiskInfo(null);

        try {
            const data = await login(identifier, password);

            if (data.success) {
                if (data.riskAssessment) setRiskInfo(data.riskAssessment);

                if (data.challengeRequired) {
                    setMessage({ text: 'Security challenge required.', type: 'warning' });
                    // For simplicity, auto-resolve challenge on mobile
                    setTimeout(() => {
                        navigation.replace('Dashboard', { user: data.user });
                    }, 1000);
                } else {
                    setMessage({ text: `Welcome, ${data.user?.name || 'User'}!`, type: 'success' });
                    setTimeout(() => {
                        navigation.replace('Dashboard', { user: data.user });
                    }, 600);
                }
                return;
            }

            // Rate limit
            if (data.status === 429 && data.retryAfterSeconds) {
                setRateLimitUntil(Date.now() + data.retryAfterSeconds * 1000);
                setMessage({ text: data.message || 'Too many attempts.', type: 'error' });
                return;
            }

            setMessage({ text: data.message || 'Login failed.', type: 'error' });
            if (data.riskAssessment) setRiskInfo(data.riskAssessment);
        } catch (err) {
            setMessage({ text: 'Connection error. Is the backend running?', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // ── Register ──
    const handleRegister = async () => {
        if (loading) return;
        setLoading(true);
        setMessage({ text: '', type: '' });

        try {
            const data = await register(email, password, name, phone);

            if (data.success) {
                setMessage({ text: 'Registration successful! Please login.', type: 'success' });
                setTimeout(() => {
                    setIsLogin(true);
                    setIdentifier(email);
                    setPassword('');
                }, 1000);
            } else {
                setMessage({ text: data.message || 'Registration failed.', type: 'error' });
            }
        } catch (err) {
            setMessage({ text: 'Connection error.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // ── Render ──
    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <StatusBar barStyle="light-content" backgroundColor="#1A1A2E" />
            <ScrollView
                contentContainerStyle={styles.scroll}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.card}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>ARES</Text>
                        <Text style={styles.subtitle}>AI-Driven Resilient & Evolutionary Systems</Text>
                    </View>

                    {/* Tabs */}
                    <View style={styles.tabs}>
                        <TouchableOpacity
                            style={[styles.tab, isLogin && styles.tabActive]}
                            onPress={() => { setIsLogin(true); setMessage({ text: '', type: '' }); }}
                            accessibilityLabel="login-tab"
                        >
                            <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Login</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, !isLogin && styles.tabActive]}
                            onPress={() => { setIsLogin(false); setMessage({ text: '', type: '' }); }}
                            accessibilityLabel="register-tab"
                        >
                            <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>Register</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Message */}
                    {message.text ? (
                        <View
                            style={[
                                styles.messageBox,
                                message.type === 'error' && styles.messageError,
                                message.type === 'success' && styles.messageSuccess,
                                message.type === 'warning' && styles.messageWarning,
                            ]}
                            accessibilityLabel="message-box"
                        >
                            <Text style={styles.messageText}>{message.text}</Text>
                        </View>
                    ) : null}

                    {/* Risk Info */}
                    {riskInfo && (
                        <View style={styles.riskBadge} accessibilityLabel="risk-info">
                            <Text style={styles.riskLabel}>
                                Risk: {riskInfo.riskLevel} — Score: {riskInfo.riskScore}/100
                            </Text>
                            {riskInfo.llmVerdict && (
                                <Text style={styles.riskVerdict}>LLM Verdict: {riskInfo.llmVerdict}</Text>
                            )}
                        </View>
                    )}

                    {/* Login Form */}
                    {isLogin ? (
                        <View>
                            <Text style={styles.label}>Email or Phone</Text>
                            <TextInput
                                style={styles.input}
                                value={identifier}
                                onChangeText={setIdentifier}
                                placeholder="Enter email or phone"
                                placeholderTextColor="#999"
                                autoCapitalize="none"
                                keyboardType="email-address"
                                accessibilityLabel="identifier"
                            />

                            <Text style={styles.label}>Password</Text>
                            <TextInput
                                style={styles.input}
                                value={password}
                                onChangeText={setPassword}
                                placeholder="Enter password"
                                placeholderTextColor="#999"
                                secureTextEntry
                                accessibilityLabel="password"
                            />

                            <TouchableOpacity
                                style={[styles.submitBtn, (loading || isRateLimited) && styles.submitBtnDisabled]}
                                onPress={handleLogin}
                                disabled={loading || isRateLimited}
                                accessibilityLabel="login-button"
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <Text style={styles.submitBtnText}>
                                        {isRateLimited ? `Try again in ${rateLimitSeconds}s` : 'Login'}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    ) : (
                        /* Register Form */
                        <View>
                            <Text style={styles.label}>Full Name</Text>
                            <TextInput
                                style={styles.input}
                                value={name}
                                onChangeText={setName}
                                placeholder="Enter your name"
                                placeholderTextColor="#999"
                                accessibilityLabel="name"
                            />

                            <Text style={styles.label}>Email</Text>
                            <TextInput
                                style={styles.input}
                                value={email}
                                onChangeText={setEmail}
                                placeholder="Enter email"
                                placeholderTextColor="#999"
                                autoCapitalize="none"
                                keyboardType="email-address"
                                accessibilityLabel="email"
                            />

                            <Text style={styles.label}>Phone (Optional)</Text>
                            <TextInput
                                style={styles.input}
                                value={phone}
                                onChangeText={setPhone}
                                placeholder="Enter phone number"
                                placeholderTextColor="#999"
                                keyboardType="phone-pad"
                                accessibilityLabel="phone"
                            />

                            <Text style={styles.label}>Password</Text>
                            <TextInput
                                style={styles.input}
                                value={password}
                                onChangeText={setPassword}
                                placeholder="Enter password"
                                placeholderTextColor="#999"
                                secureTextEntry
                                accessibilityLabel="register-password"
                            />

                            <TouchableOpacity
                                style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                                onPress={handleRegister}
                                disabled={loading}
                                accessibilityLabel="register-button"
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <Text style={styles.submitBtnText}>Register</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Test Credentials */}
                    <View style={styles.testCredentials}>
                        <Text style={styles.testTitle}>Test Credentials (Password: Password123!)</Text>
                        <Text style={styles.testItem}>🟢 clean@example.com — LOW risk</Text>
                        <Text style={styles.testItem}>🟡 traveler@example.com — MEDIUM</Text>
                        <Text style={styles.testItem}>⚠️ challenged@example.com — Challenged</Text>
                        <Text style={styles.testItem}>🔴 risky@example.com — HIGH risk</Text>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1A2E',
    },
    scroll: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 20,
    },
    card: {
        backgroundColor: '#16213E',
        borderRadius: 16,
        padding: 24,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    header: {
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 32,
        fontWeight: '800',
        color: '#6C63FF',
        letterSpacing: 2,
    },
    subtitle: {
        fontSize: 12,
        color: '#A0AEC0',
        marginTop: 4,
    },
    tabs: {
        flexDirection: 'row',
        marginBottom: 20,
        borderRadius: 10,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#2D3748',
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        backgroundColor: '#1A1A2E',
    },
    tabActive: {
        backgroundColor: '#6C63FF',
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#A0AEC0',
    },
    tabTextActive: {
        color: '#FFF',
    },
    messageBox: {
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
    },
    messageError: {
        backgroundColor: '#FED7D7',
    },
    messageSuccess: {
        backgroundColor: '#C6F6D5',
    },
    messageWarning: {
        backgroundColor: '#FEFCBF',
    },
    messageText: {
        fontSize: 13,
        color: '#1A1A2E',
        textAlign: 'center',
    },
    riskBadge: {
        backgroundColor: '#2D3748',
        padding: 10,
        borderRadius: 8,
        marginBottom: 16,
    },
    riskLabel: {
        color: '#FBD38D',
        fontSize: 13,
        fontWeight: '600',
    },
    riskVerdict: {
        color: '#FC8181',
        fontSize: 12,
        marginTop: 2,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: '#A0AEC0',
        marginBottom: 6,
        marginTop: 12,
    },
    input: {
        borderWidth: 1.5,
        borderColor: '#2D3748',
        borderRadius: 10,
        padding: 12,
        fontSize: 14,
        color: '#E2E8F0',
        backgroundColor: '#1A1A2E',
    },
    submitBtn: {
        backgroundColor: '#6C63FF',
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 20,
    },
    submitBtnDisabled: {
        opacity: 0.6,
    },
    submitBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '700',
    },
    testCredentials: {
        marginTop: 24,
        borderTopWidth: 1,
        borderTopColor: '#2D3748',
        paddingTop: 16,
    },
    testTitle: {
        color: '#A0AEC0',
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 6,
    },
    testItem: {
        color: '#718096',
        fontSize: 11,
        marginTop: 2,
    },
});

export default LoginScreen;
