import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { getCandidateProfile, parseResume, saveCandidateProfile } from '@/services/jobs-api';
import type { CandidateProfile } from '@/types/candidate-profile';

const emptyProfile: CandidateProfile = { fullName: '', email: '', phone: '', skills: [] };
const resumeTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { session } = useAuth();
  const [profile, setProfile] = useState<CandidateProfile>(emptyProfile);
  const [isLoading, setIsLoading] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resumeName, setResumeName] = useState('');
  const [skillDraft, setSkillDraft] = useState('');
  const isDark = theme.background === '#000000';
  const colors = {
    background: isDark ? '#101411' : '#F5F7F4',
    surface: isDark ? '#191F1B' : '#FFFFFF',
    border: isDark ? '#29312B' : '#E0E6DF',
    text: isDark ? '#F1F5F1' : '#202923',
    muted: isDark ? '#A0ACA3' : '#758078',
    danger: '#A85B5B',
  };

  useEffect(() => {
    let active = true;
    getCandidateProfile(session!.token)
      .then((savedProfile) => {
        if (active) {
          setProfile({ ...savedProfile, email: savedProfile.email || session!.user.email });
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load your profile.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [session]);

  const updateField = (field: keyof Omit<CandidateProfile, 'skills'>, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const addSkill = () => {
    const skill = skillDraft.trim();
    if (!skill) return;
    setProfile((current) => (
      current.skills.some((item) => item.toLocaleLowerCase() === skill.toLocaleLowerCase())
        ? current
        : { ...current, skills: [...current.skills, skill].slice(0, 40) }
    ));
    setSkillDraft('');
  };

  const removeSkill = (skillToRemove: string) => {
    setProfile((current) => ({
      ...current,
      skills: current.skills.filter((skill) => skill !== skillToRemove),
    }));
  };

  const pickAndParseResume = async () => {
    setError('');
    setMessage('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: resumeTypes,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if (asset.size !== undefined && asset.size > 5 * 1024 * 1024) {
        setError('Resume files must be 5 MB or smaller.');
        return;
      }

      setResumeName(asset.name);
      setIsParsing(true);
      const extracted = await parseResume(session!.token, asset);
      setProfile((current) => ({
        fullName: extracted.fullName || current.fullName,
        email: extracted.email || current.email,
        phone: extracted.phone || current.phone,
        skills: extracted.skills.length > 0 ? extracted.skills : current.skills,
      }));
      const count = [
        extracted.fullName,
        extracted.email,
        extracted.phone,
        extracted.skills.length > 0 ? 'skills' : '',
      ].filter(Boolean).length;
      setMessage(`Found ${count} profile detail${count === 1 ? '' : 's'}. Review and save your profile.`);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Could not parse this resume.');
    } finally {
      setIsParsing(false);
    }
  };

  const saveProfile = async () => {
    setError('');
    setMessage('');
    setIsSaving(true);
    try {
      const normalizedProfile = {
        ...profile,
        fullName: profile.fullName.trim(),
        email: profile.email.trim(),
        phone: profile.phone.trim(),
        skills: profile.skills.map((skill) => skill.trim()).filter(Boolean),
      };
      setProfile(await saveCandidateProfile(session!.token, normalizedProfile));
      setMessage('Profile saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save your profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = [styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.four },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={{ color: colors.text, fontSize: 28 }}>‹</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>Candidate profile</Text>
          <View style={styles.backButton} />
        </View>

        <View style={styles.hero}>
          <View style={styles.heroMark}><Text style={styles.heroMarkText}>✦</Text></View>
          <Text style={styles.heroEyebrow}>YOUR CAREER PROFILE</Text>
          <Text style={styles.heroTitle}>Make it yours.</Text>
          <Text style={styles.heroCopy}>
            Parse a resume to fill your details, then review and save them securely to your account.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>RESUME PARSER</Text>
          <Text style={[styles.helper, { color: colors.muted }]}>
            PDF or DOCX · 5 MB max · Files are parsed in memory and not stored.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={isParsing || isLoading}
            onPress={() => void pickAndParseResume()}
            style={({ pressed }) => [styles.parseButton, pressed && styles.pressed]}
          >
            <Text style={styles.parseButtonText}>
              {isParsing ? 'Reading resume…' : resumeName ? `Parse again · ${resumeName}` : '↑  Choose a resume to autofill'}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>YOUR DETAILS</Text>
          <TextInput
            accessibilityLabel="Full name"
            placeholder="Full name"
            placeholderTextColor={colors.muted}
            value={profile.fullName}
            onChangeText={(value) => updateField('fullName', value)}
            style={inputStyle}
          />
          <TextInput
            accessibilityLabel="Email address"
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email address"
            placeholderTextColor={colors.muted}
            value={profile.email}
            onChangeText={(value) => updateField('email', value)}
            style={inputStyle}
          />
          <TextInput
            accessibilityLabel="Phone number"
            keyboardType="phone-pad"
            placeholder="Phone number"
            placeholderTextColor={colors.muted}
            value={profile.phone}
            onChangeText={(value) => updateField('phone', value)}
            style={inputStyle}
          />
          <Text style={[styles.skillsLabel, { color: colors.muted }]}>SKILLS</Text>
          <View style={[styles.skillsBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            {profile.skills.length > 0 ? (
              <View style={styles.skillTags}>
                {profile.skills.map((skill) => (
                  <View key={skill} style={styles.skillTag}>
                    <Text style={styles.skillTagText}>{skill}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${skill} skill`}
                      onPress={() => removeSkill(skill)}
                      hitSlop={6}
                    >
                      <Text style={styles.removeSkill}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.noSkills, { color: colors.muted }]}>
                Parsed skills will appear here. You can also add them manually.
              </Text>
            )}
            <View style={styles.skillEntryRow}>
              <TextInput
                accessibilityLabel="Add a skill"
                placeholder="Add a skill"
                placeholderTextColor={colors.muted}
                value={skillDraft}
                onChangeText={setSkillDraft}
                onSubmitEditing={addSkill}
                returnKeyType="done"
                style={[styles.skillEntry, { color: colors.text }]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add skill"
                onPress={addSkill}
                style={({ pressed }) => [styles.addSkillButton, pressed && styles.pressed]}
              >
                <Text style={styles.addSkillText}>Add</Text>
              </Pressable>
            </View>
          </View>
          {error ? <Text accessibilityRole="alert" style={[styles.statusText, { color: colors.danger }]}>{error}</Text> : null}
          {message ? <Text style={[styles.statusText, { color: '#527044' }]}>{message}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={isSaving || isLoading || isParsing}
            onPress={() => void saveProfile()}
            style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
          >
            <Text style={styles.saveButtonText}>
              {isLoading ? 'Loading profile…' : isSaving ? 'Saving…' : 'Save profile'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { alignSelf: 'center', gap: 14, maxWidth: 680, paddingHorizontal: Spacing.three, width: '100%' },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  backButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  title: { fontSize: 20, fontWeight: '800' },
  hero: { backgroundColor: '#20372C', borderRadius: 24, marginBottom: 2, overflow: 'hidden', padding: 21 },
  heroMark: { alignItems: 'center', backgroundColor: 'rgba(198,243,106,0.16)', borderRadius: 15, height: 38, justifyContent: 'center', width: 38 },
  heroMarkText: { color: '#C6F36A', fontSize: 18 },
  heroEyebrow: { color: '#C6F36A', fontSize: 9, fontWeight: '900', letterSpacing: 1.4, marginTop: 16 },
  heroTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', letterSpacing: -0.7, marginTop: 4 },
  heroCopy: { color: '#D1DCD1', fontSize: 13, lineHeight: 20, marginTop: 7, maxWidth: 440 },
  card: { borderRadius: 20, borderWidth: 1, padding: 16 },
  sectionLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 6 },
  helper: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  parseButton: { alignItems: 'center', backgroundColor: '#E8F0E2', borderRadius: 12, minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 },
  parseButtonText: { color: '#20372C', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  input: { borderRadius: 12, borderWidth: 1, fontSize: 15, marginTop: 10, minHeight: 48, paddingHorizontal: 13, paddingVertical: 12 },
  skillsLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginTop: 16 },
  skillsBox: { borderRadius: 12, borderWidth: 1, marginTop: 7, padding: 10 },
  skillTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  skillTag: { alignItems: 'center', backgroundColor: '#E8F0E2', borderRadius: 999, flexDirection: 'row', gap: 8, paddingHorizontal: 11, paddingVertical: 7 },
  skillTagText: { color: '#20372C', fontSize: 12, fontWeight: '700' },
  removeSkill: { color: '#49683D', fontSize: 15, fontWeight: '800' },
  noSkills: { fontSize: 12, lineHeight: 18 },
  skillEntryRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 9 },
  skillEntry: { flex: 1, fontSize: 14, minHeight: 40, paddingHorizontal: 4, paddingVertical: 8 },
  addSkillButton: { backgroundColor: '#20372C', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9 },
  addSkillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  statusText: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  saveButton: { alignItems: 'center', backgroundColor: '#20372C', borderRadius: 12, marginTop: 14, minHeight: 50, justifyContent: 'center' },
  saveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.75 },
});
