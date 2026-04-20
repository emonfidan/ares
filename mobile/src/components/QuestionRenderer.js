/**
 * QuestionRenderer.js — Renders all 6 survey question types as native components.
 *
 * Mirrors the web SurveyPlayer.jsx renderers but uses React Native primitives.
 * Every interactive element has an accessibilityLabel for Appium test targeting.
 *
 * Supported types:
 *   single-choice  → TouchableOpacity button group
 *   dropdown       → Picker component
 *   numeric        → TextInput with numeric keyboard
 *   scale          → TouchableOpacity button row
 *   open-text      → TextInput multiline
 *   year-dropdown  → Picker component
 */

import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Picker } from '@react-native-picker/picker';

// ─── Validation ──────────────────────────────────────────

function getValidationError(question, answers) {
    if (question.type !== 'numeric') return null;
    const val = question.validation;
    if (!val) return null;

    const answer = answers[question.id];
    if (answer === undefined || answer === null || answer === '') return null;

    const str = String(answer).trim();

    if (val.numericOnly && !/^\d+$/.test(str)) {
        return 'Only numeric characters are allowed.';
    }
    if (val.numericOnly && val.length && str.length !== val.length) {
        return `Must be exactly ${val.length} digits.`;
    }
    return null;
}

// ─── Single Choice ───────────────────────────────────────

function SingleChoice({ question, currentAnswer, onAnswerChange }) {
    return (
        <View
            style={styles.choiceGroup}
            accessibilityLabel={`choices-${question.id}`}
        >
            {(question.options || []).map((opt) => (
                <TouchableOpacity
                    key={opt}
                    style={[
                        styles.choiceBtn,
                        currentAnswer === opt && styles.choiceBtnSelected,
                    ]}
                    onPress={() => onAnswerChange(question.id, opt)}
                    accessibilityLabel={`option-${question.id}-${opt.replace(/\s+/g, '-').toLowerCase()}`}
                >
                    <Text
                        style={[
                            styles.choiceBtnText,
                            currentAnswer === opt && styles.choiceBtnTextSelected,
                        ]}
                    >
                        {opt}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

// ─── Dropdown ────────────────────────────────────────────

function Dropdown({ question, currentAnswer, onAnswerChange }) {
    return (
        <View style={styles.pickerWrapper} accessibilityLabel={`dropdown-${question.id}`}>
            <Picker
                selectedValue={currentAnswer || ''}
                onValueChange={(val) => onAnswerChange(question.id, val)}
                style={styles.picker}
                accessibilityLabel={`picker-${question.id}`}
            >
                <Picker.Item label="Select…" value="" />
                {(question.options || []).map((opt) => (
                    <Picker.Item key={opt} label={opt} value={opt} />
                ))}
            </Picker>
        </View>
    );
}

// ─── Numeric ─────────────────────────────────────────────

function Numeric({ question, currentAnswer, onAnswerChange }) {
    const val = question.validation;
    const placeholder = val?.length
        ? `${val.length}-digit ID`
        : 'Enter number';

    return (
        <TextInput
            style={styles.textInput}
            keyboardType="numeric"
            value={currentAnswer || ''}
            maxLength={val?.length || undefined}
            placeholder={placeholder}
            placeholderTextColor="#999"
            onChangeText={(text) => {
                const digitsOnly = val?.numericOnly
                    ? text.replace(/\D/g, '')
                    : text;
                onAnswerChange(question.id, digitsOnly);
            }}
            accessibilityLabel={`numeric-${question.id}`}
        />
    );
}

// ─── Scale ───────────────────────────────────────────────

function Scale({ question, currentAnswer, onAnswerChange }) {
    const min = question.min ?? 1;
    const max = question.max ?? 5;
    const step = question.step ?? 1;
    const steps = [];
    for (let v = min; v <= max; v = Math.round((v + step) * 10) / 10) {
        steps.push(v);
    }

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.scaleGroup}
            accessibilityLabel={`scale-${question.id}`}
        >
            {steps.map((v) => (
                <TouchableOpacity
                    key={v}
                    style={[
                        styles.scaleBtn,
                        currentAnswer === v && styles.scaleBtnSelected,
                    ]}
                    onPress={() => onAnswerChange(question.id, v)}
                    accessibilityLabel={`scale-${question.id}-${v}`}
                >
                    <Text
                        style={[
                            styles.scaleBtnText,
                            currentAnswer === v && styles.scaleBtnTextSelected,
                        ]}
                    >
                        {v}
                    </Text>
                </TouchableOpacity>
            ))}
        </ScrollView>
    );
}

// ─── Open Text ───────────────────────────────────────────

function OpenText({ question, currentAnswer, onAnswerChange }) {
    const maxLen = question.maxLength || null;
    const current = (currentAnswer || '').length;

    return (
        <View>
            <TextInput
                style={[styles.textInput, styles.textArea]}
                multiline
                numberOfLines={4}
                value={currentAnswer || ''}
                maxLength={maxLen || undefined}
                placeholder={question.placeholder || 'Enter your answer…'}
                placeholderTextColor="#999"
                onChangeText={(text) => onAnswerChange(question.id, text)}
                accessibilityLabel={`textarea-${question.id}`}
            />
            {maxLen && (
                <Text
                    style={[
                        styles.charCounter,
                        current >= maxLen && styles.charCounterLimit,
                    ]}
                    accessibilityLabel={`char-counter-${question.id}`}
                >
                    {current}/{maxLen}
                </Text>
            )}
        </View>
    );
}

// ─── Year Dropdown ───────────────────────────────────────

function YearDropdown({ question, currentAnswer, onAnswerChange }) {
    const minYear = question.minYear ?? 1900;
    const maxYear = question.maxYear ?? new Date().getFullYear();
    const years = [];
    for (let y = maxYear; y >= minYear; y--) years.push(y);

    return (
        <View style={styles.pickerWrapper} accessibilityLabel={`year-dropdown-${question.id}`}>
            <Picker
                selectedValue={currentAnswer || ''}
                onValueChange={(val) => onAnswerChange(question.id, val)}
                style={styles.picker}
                accessibilityLabel={`year-picker-${question.id}`}
            >
                <Picker.Item label="Select year…" value="" />
                {years.map((y) => (
                    <Picker.Item key={y} label={String(y)} value={String(y)} />
                ))}
            </Picker>
        </View>
    );
}

// ─── Main Renderer ───────────────────────────────────────

const QuestionRenderer = ({ question, answers, onAnswerChange }) => {
    const currentAnswer = answers[question.id];
    const validationError = getValidationError(question, answers);
    let input = null;

    switch (question.type) {
        case 'single-choice':
            input = <SingleChoice question={question} currentAnswer={currentAnswer} onAnswerChange={onAnswerChange} />;
            break;
        case 'dropdown':
            input = <Dropdown question={question} currentAnswer={currentAnswer} onAnswerChange={onAnswerChange} />;
            break;
        case 'numeric':
            input = <Numeric question={question} currentAnswer={currentAnswer} onAnswerChange={onAnswerChange} />;
            break;
        case 'scale':
            input = <Scale question={question} currentAnswer={currentAnswer} onAnswerChange={onAnswerChange} />;
            break;
        case 'open-text':
            input = <OpenText question={question} currentAnswer={currentAnswer} onAnswerChange={onAnswerChange} />;
            break;
        case 'year-dropdown':
            input = <YearDropdown question={question} currentAnswer={currentAnswer} onAnswerChange={onAnswerChange} />;
            break;
        default:
            input = <Text style={styles.unsupported}>Unsupported question type: {question.type}</Text>;
    }

    return (
        <View style={styles.questionCard} accessibilityLabel={`question-${question.id}`}>
            <Text style={styles.questionText}>
                {question.text}
                {question.required && <Text style={styles.requiredMarker}> *</Text>}
            </Text>
            {input}
            {validationError && (
                <Text style={styles.validationError} accessibilityLabel={`error-${question.id}`}>
                    {validationError}
                </Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    questionCard: {
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 14,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
    },
    questionText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1A1A2E',
        marginBottom: 12,
        lineHeight: 22,
    },
    requiredMarker: {
        color: '#E74C3C',
        fontWeight: '700',
    },
    choiceGroup: {
        gap: 8,
    },
    choiceBtn: {
        borderWidth: 1.5,
        borderColor: '#D1D5DB',
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginBottom: 8,
        backgroundColor: '#FAFAFA',
    },
    choiceBtnSelected: {
        borderColor: '#6C63FF',
        backgroundColor: '#EEF0FF',
    },
    choiceBtnText: {
        fontSize: 14,
        color: '#374151',
    },
    choiceBtnTextSelected: {
        color: '#6C63FF',
        fontWeight: '700',
    },
    pickerWrapper: {
        borderWidth: 1.5,
        borderColor: '#D1D5DB',
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: '#FAFAFA',
    },
    picker: {
        height: 50,
        color: '#374151',
    },
    textInput: {
        borderWidth: 1.5,
        borderColor: '#D1D5DB',
        borderRadius: 10,
        padding: 12,
        fontSize: 14,
        color: '#374151',
        backgroundColor: '#FAFAFA',
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
    },
    charCounter: {
        fontSize: 12,
        color: '#9CA3AF',
        textAlign: 'right',
        marginTop: 4,
    },
    charCounterLimit: {
        color: '#E74C3C',
    },
    scaleGroup: {
        flexDirection: 'row',
    },
    scaleBtn: {
        borderWidth: 1.5,
        borderColor: '#D1D5DB',
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 18,
        marginRight: 8,
        backgroundColor: '#FAFAFA',
    },
    scaleBtnSelected: {
        borderColor: '#6C63FF',
        backgroundColor: '#EEF0FF',
    },
    scaleBtnText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
    },
    scaleBtnTextSelected: {
        color: '#6C63FF',
    },
    validationError: {
        color: '#E74C3C',
        fontSize: 12,
        marginTop: 6,
        fontWeight: '500',
    },
    unsupported: {
        color: '#999',
        fontStyle: 'italic',
    },
});

export default QuestionRenderer;
