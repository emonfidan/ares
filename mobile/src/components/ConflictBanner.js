/**
 * ConflictBanner.js — Schema conflict notification (NOT a simple alert!)
 *
 * Displays a persistent in-app banner when the GBCR/RCLR algorithm
 * detects a version conflict between the client's survey session and
 * the server's updated schema.
 *
 * Shows:
 *   - Version transition (oldVersion → newVersion)
 *   - Number of dropped/invalidated answers
 *   - Rollback stable node information
 *   - "Understood" dismiss button
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const ConflictBanner = ({ conflictInfo, onDismiss }) => {
    if (!conflictInfo) return null;

    return (
        <View style={styles.banner} accessibilityLabel="conflict-banner">
            <View style={styles.inner}>
                <Text style={styles.icon}>⚠️</Text>

                <View style={styles.content}>
                    <Text style={styles.title}>Survey Updated While You Were Answering</Text>

                    <Text style={styles.description}>
                        The survey administrator modified this survey
                        (v{conflictInfo.oldVersion} → v{conflictInfo.newVersion}).
                    </Text>

                    {conflictInfo.droppedAnswers && conflictInfo.droppedAnswers.length > 0 && (
                        <Text style={styles.detail} accessibilityLabel="conflict-dropped-answers">
                            <Text style={styles.bold}>Answers removed: </Text>
                            {conflictInfo.droppedAnswers.length} answer(s) were invalidated
                            by the schema change and have been cleared.
                        </Text>
                    )}

                    {conflictInfo.stableNode && (
                        <Text style={styles.detail} accessibilityLabel="conflict-stable-node">
                            <Text style={styles.bold}>Rollback point: </Text>
                            Your progress has been preserved up to question
                            "{conflictInfo.stableNode}". Please review and continue.
                        </Text>
                    )}

                    <Text style={styles.note}>
                        Your remaining valid answers have been automatically recovered.
                        Please review the survey and complete any new or missing fields.
                    </Text>
                </View>
            </View>

            <TouchableOpacity
                style={styles.dismissBtn}
                onPress={onDismiss}
                accessibilityLabel="conflict-dismiss"
            >
                <Text style={styles.dismissText}>Understood</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    banner: {
        backgroundColor: '#FFF3CD',
        borderWidth: 1,
        borderColor: '#FFCD39',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
    },
    inner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    icon: {
        fontSize: 28,
        marginRight: 12,
        marginTop: 2,
    },
    content: {
        flex: 1,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        color: '#856404',
        marginBottom: 6,
    },
    description: {
        fontSize: 14,
        color: '#856404',
        marginBottom: 8,
    },
    detail: {
        fontSize: 13,
        color: '#664D03',
        marginBottom: 6,
        paddingLeft: 4,
    },
    bold: {
        fontWeight: '700',
    },
    note: {
        fontSize: 12,
        color: '#856404',
        fontStyle: 'italic',
        marginTop: 4,
    },
    dismissBtn: {
        marginTop: 12,
        backgroundColor: '#856404',
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    dismissText: {
        color: '#FFF',
        fontWeight: '700',
        fontSize: 14,
    },
});

export default ConflictBanner;
