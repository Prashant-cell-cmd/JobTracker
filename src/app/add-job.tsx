import { useEffect, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useJobStore, type JobStatus } from '../hooks/use-job-store';

const statuses: JobStatus[] = ['Applied', 'Interview', 'Offer', 'Rejected'];

export default function AddJobScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { jobs, isLoaded, error, reload, addJob, updateJob } = useJobStore();
  const existingJob = id ? jobs.find((job) => job.id === id) : undefined;
  const [company, setCompany] = useState(existingJob?.company ?? '');
  const [title, setTitle] = useState(existingJob?.title ?? '');
  const [location, setLocation] = useState(existingJob?.location ?? '');
  const [salary, setSalary] = useState(existingJob?.salary ?? '');
  const [notes, setNotes] = useState(existingJob?.notes ?? '');
  const [applicationUrl, setApplicationUrl] = useState(existingJob?.applicationUrl ?? '');
  const [resumeName, setResumeName] = useState(existingJob?.resumeName ?? '');
  const [resumeUri, setResumeUri] = useState(existingJob?.resumeUri ?? '');
  const [status, setStatus] = useState<JobStatus>(existingJob?.status ?? 'Applied');
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!existingJob) return;
    const frame = requestAnimationFrame(() => {
      setCompany(existingJob.company);
      setTitle(existingJob.title);
      setLocation(existingJob.location);
      setSalary(existingJob.salary);
      setNotes(existingJob.notes);
      setApplicationUrl(existingJob.applicationUrl);
      setResumeName(existingJob.resumeName);
      setResumeUri(existingJob.resumeUri);
      setStatus(existingJob.status);
    });
    return () => cancelAnimationFrame(frame);
  }, [existingJob]);

  const colors = {
    background: theme.background === '#000000' ? '#101411' : '#F5F7F4',
    surface: theme.background === '#000000' ? '#191F1B' : '#FFFFFF',
    border: theme.background === '#000000' ? '#29312B' : '#E0E6DF',
    text: theme.background === '#000000' ? '#F1F5F1' : '#202923',
    muted: theme.background === '#000000' ? '#A0ACA3' : '#758078',
    danger: '#A85B5B',
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const pickResume = async () => {
    setValidationError('');
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const file = result.assets[0];
    if (!file) return;
    setResumeName(file.name);
    setResumeUri(file.uri);
  };

  const saveJob = async () => {
    if (!company.trim() || !title.trim()) {
      setValidationError('Company name and job title are required.');
      return;
    }
    if (applicationUrl.trim() && !/^https?:\/\/\S+$/i.test(applicationUrl.trim())) {
      setValidationError('Enter a complete link beginning with http:// or https://.');
      return;
    }

    setValidationError('');
    setIsSaving(true);
    try {
      const details = {
        company: company.trim(),
        title: title.trim(),
        location: location.trim(),
        salary: salary.trim(),
        notes: notes.trim(),
        applicationUrl: applicationUrl.trim(),
        resumeName,
        resumeUri,
        status,
      };
      if (id) {
        await updateJob(id, details);
      } else {
        await addJob(details);
      }
      goBack();
    } catch {
      // The store exposes persistence errors in the form so the user can retry.
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = [styles.input, { color: colors.text, borderColor: colors.border }];
  const placeholderTextColor = colors.muted;

  if (id && isLoaded && !existingJob) {
    return (
      <View style={[styles.screen, styles.notFound, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>Application not found</Text>
        <Text style={[styles.helpText, { color: colors.muted }]}>
          It may have been removed from your tracker.
        </Text>
        <Pressable onPress={goBack} style={styles.saveButton}>
          <Text style={styles.saveText}>Back to applications</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.two,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.five,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={goBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Text style={[styles.backText, { color: colors.text }]}>‹</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>
            {id ? 'Edit application' : 'Add application'}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.formHero}>
          <View>
            <Text style={styles.formHeroEyebrow}>NEXT OPPORTUNITY</Text>
            <Text style={styles.formHeroTitle}>{id ? 'Refine the details' : 'Capture the moment'}</Text>
          </View>
          <View style={styles.formHeroMark}>
            <Text style={styles.formHeroMarkText}>{id ? '↗' : '+'}</Text>
          </View>
        </View>

        {error ? (
          <View style={[styles.errorBox, { borderColor: colors.danger }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            <Pressable onPress={() => void reload()} accessibilityRole="button">
              <Text style={[styles.retryText, { color: colors.danger }]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        {validationError ? (
          <Text accessibilityRole="alert" style={[styles.validationText, { color: colors.danger }]}>
            {validationError}
          </Text>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>JOB DETAILS</Text>
          <TextInput
            accessibilityLabel="Company name"
            value={company}
            onChangeText={setCompany}
            placeholder="Company name *"
            placeholderTextColor={placeholderTextColor}
            style={inputStyle}
            returnKeyType="next"
          />
          <TextInput
            accessibilityLabel="Job title"
            value={title}
            onChangeText={setTitle}
            placeholder="Job title *"
            placeholderTextColor={placeholderTextColor}
            style={inputStyle}
            returnKeyType="next"
          />
          <TextInput
            accessibilityLabel="Location"
            value={location}
            onChangeText={setLocation}
            placeholder="Location"
            placeholderTextColor={placeholderTextColor}
            style={inputStyle}
            returnKeyType="next"
          />
          <TextInput
            accessibilityLabel="Salary"
            value={salary}
            onChangeText={setSalary}
            placeholder="Salary or range"
            placeholderTextColor={placeholderTextColor}
            keyboardType="numbers-and-punctuation"
            style={inputStyle}
          />
          <TextInput
            accessibilityLabel="Application link"
            value={applicationUrl}
            onChangeText={setApplicationUrl}
            placeholder="Application link (https://...)"
            placeholderTextColor={placeholderTextColor}
            autoCapitalize="none"
            keyboardType="url"
            style={inputStyle}
          />
          <TextInput
            accessibilityLabel="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes, contact, or next steps"
            placeholderTextColor={placeholderTextColor}
            multiline
            textAlignVertical="top"
            style={[inputStyle, styles.notesInput]}
          />

          <Text style={[styles.sectionLabel, styles.statusHeading, { color: colors.muted }]}>RESUME</Text>
          <View style={[styles.resumeBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.resumeCopy}>
              <Text style={[styles.resumeIcon, { color: colors.text }]}>▤</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.resumeTitle, { color: colors.text }]}>
                  {resumeName || 'Attach a resume'}
                </Text>
                <Text style={[styles.resumeSubtitle, { color: colors.muted }]}>
                  {resumeName ? 'PDF or Word document selected' : 'PDF, DOC, or DOCX'}
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={resumeName ? 'Replace resume' : 'Upload resume'}
              onPress={() => void pickResume()}
              style={({ pressed }) => [styles.resumeButton, pressed && styles.pressed]}
            >
              <Text style={styles.resumeButtonText}>{resumeName ? 'Replace' : 'Upload'}</Text>
            </Pressable>
            {resumeName ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove resume"
                onPress={() => { setResumeName(''); setResumeUri(''); }}
                style={styles.resumeRemove}
              >
                <Text style={{ color: colors.danger, fontWeight: '800' }}>Remove</Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={[styles.sectionLabel, styles.statusHeading, { color: colors.muted }]}>STATUS</Text>
          <View style={styles.statusRow}>
            {statuses.map((item) => {
              const isSelected = item === status;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setStatus(item)}
                  style={[
                    styles.statusChip,
                    {
                      borderColor: isSelected ? '#20372C' : colors.border,
                      backgroundColor: isSelected ? '#20372C' : colors.surface,
                    },
                  ]}
                >
                  <Text style={{ color: isSelected ? '#FFFFFF' : colors.text, fontWeight: '700' }}>
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={isSaving || !isLoaded}
          onPress={() => void saveJob()}
          style={({ pressed }) => [
            styles.saveButton,
            (pressed || isSaving || !isLoaded) && styles.pressed,
          ]}
        >
          <Text style={styles.saveText}>
            {isSaving ? 'Saving...' : id ? 'Save changes' : 'Save application'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: Spacing.three },
  notFound: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.three },
  formHero: {
    alignItems: 'center',
    backgroundColor: '#20372C',
    borderRadius: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  formHeroEyebrow: { color: '#C6F36A', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  formHeroTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginTop: 4 },
  formHeroMark: {
    alignItems: 'center',
    backgroundColor: 'rgba(198,243,106,0.16)',
    borderColor: 'rgba(198,243,106,0.28)',
    borderRadius: 18,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  formHeroMarkText: { color: '#C6F36A', fontSize: 21, fontWeight: '800' },
  backButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  backText: { fontSize: 32, lineHeight: 36 },
  title: { fontSize: 22, fontWeight: '800' },
  headerSpacer: { width: 44 },
  card: { borderRadius: 20, borderWidth: 1, padding: Spacing.three },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: Spacing.two },
  statusHeading: { marginTop: Spacing.two },
  input: { borderRadius: 12, borderWidth: 1, fontSize: 16, marginBottom: Spacing.two, paddingHorizontal: 14, paddingVertical: 14 },
  notesInput: { minHeight: 100 },
  resumeBox: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4, padding: 12 },
  resumeCopy: { alignItems: 'center', flex: 1, flexDirection: 'row', minWidth: 180 },
  resumeIcon: { fontSize: 24, marginRight: 10 },
  resumeTitle: { fontSize: 13, fontWeight: '800' },
  resumeSubtitle: { fontSize: 11, marginTop: 3 },
  resumeButton: { backgroundColor: '#20372C', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  resumeButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  resumeRemove: { paddingHorizontal: 10, paddingVertical: 8, width: '100%' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  statusChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 },
  saveButton: { alignItems: 'center', backgroundColor: '#20372C', borderRadius: 14, marginTop: Spacing.three, paddingVertical: 16 },
  saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  helpText: { fontSize: 14, marginTop: Spacing.two, textAlign: 'center' },
  errorBox: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.two, padding: 12 },
  errorText: { flex: 1, fontSize: 13, marginRight: Spacing.two },
  retryText: { fontSize: 13, fontWeight: '800' },
  validationText: { fontSize: 13, fontWeight: '600', marginBottom: Spacing.two },
  pressed: { opacity: 0.65 },
});
