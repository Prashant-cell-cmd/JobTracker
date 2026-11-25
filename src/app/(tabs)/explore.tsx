import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, router, useLocalSearchParams, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useJobStore, type JobStatus } from '../../hooks/use-job-store';

const jobStatuses: JobStatus[] = ['Applied', 'Interview', 'Offer', 'Rejected'];
const filters: ('All' | JobStatus)[] = ['All', ...jobStatuses];

function isJobStatus(value: string | undefined): value is JobStatus {
  return value === 'Applied' || value === 'Interview' || value === 'Offer' || value === 'Rejected';
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

export default function ApplicationsScreen() {
  const { status: routeStatus } = useLocalSearchParams<{ status?: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { jobs, isLoaded, error, reload, removeJob, updateJobStatus } = useJobStore();
  const [filter, setFilter] = useState<'All' | JobStatus>(() => (
    isJobStatus(routeStatus) ? routeStatus : 'All'
  ));
  const [query, setQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [jobToRemove, setJobToRemove] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setFilter(isJobStatus(routeStatus) ? routeStatus : 'All');
    });
    return () => cancelAnimationFrame(frame);
  }, [routeStatus]);
  const isDark = theme.background === '#000000';
  const colors = {
    background: isDark ? '#101411' : '#F5F7F4',
    surface: isDark ? '#191F1B' : '#FFFFFF',
    border: isDark ? '#29312B' : '#E8ECE7',
    text: isDark ? '#F1F5F1' : '#202923',
    muted: isDark ? '#A0ACA3' : '#758078',
    danger: '#A85B5B',
  };

  const visibleJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return jobs
      .filter((job) => filter === 'All' || job.status === filter)
      .filter((job) => (
        !normalizedQuery ||
        [job.title, job.company, job.location, job.notes, job.salary]
          .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))
      ))
      .sort((first, second) => {
        const order = first.createdAt.localeCompare(second.createdAt);
        return sortOrder === 'newest' ? -order : order;
      });
  }, [jobs, filter, query, sortOrder]);

  const runStoreAction = (action: () => Promise<void>) => {
    void action().catch(() => undefined);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentInset={{
          top: insets.top,
          bottom: insets.bottom + BottomTabInset + 100,
          left: insets.left,
          right: insets.right,
        }}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.eyebrow, { color: colors.muted }]}>APPLICATIONS</Text>
              <Text style={[styles.title, { color: colors.text }]}>Your jobs</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add application"
              onPress={() => router.push('/add-job')}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            >
              <Text style={styles.addButtonText}>+</Text>
            </Pressable>
          </View>

          {error ? (
            <View style={[styles.errorBox, { borderColor: colors.danger }]}>
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
              <Pressable onPress={() => void reload()} accessibilityRole="button">
                <Text style={[styles.retryText, { color: colors.danger }]}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              accessibilityLabel="Search applications"
              value={query}
              onChangeText={setQuery}
              placeholder="Search role, company, location..."
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              style={[styles.searchInput, { color: colors.text }]}
            />
            {query ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setQuery('')}
                style={styles.clearButton}
              >
                <Text style={{ color: colors.muted }}>×</Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {filters.map((item) => {
              const selected = item === filter;
              const count = item === 'All' ? jobs.length : jobs.filter((job) => job.status === item).length;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setFilter(item)}
                  style={[
                    styles.filter,
                    {
                      borderColor: selected ? '#20372C' : colors.border,
                      backgroundColor: selected ? '#20372C' : colors.surface,
                    },
                  ]}
                >
                  <Text style={{ color: selected ? '#FFFFFF' : colors.text, fontWeight: '700' }}>
                    {item} <Text style={{ opacity: 0.75 }}>{count}</Text>
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.resultsRow}>
            <Text style={[styles.resultsText, { color: colors.muted }]}>
              {isLoaded ? `${visibleJobs.length} result${visibleJobs.length === 1 ? '' : 's'}` : 'Loading…'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sort by ${sortOrder === 'newest' ? 'oldest' : 'newest'} first`}
              onPress={() => setSortOrder((current) => current === 'newest' ? 'oldest' : 'newest')}
            >
              <Text style={[styles.sortText, { color: colors.text }]}>
                {sortOrder === 'newest' ? 'Newest first ↓' : 'Oldest first ↑'}
              </Text>
            </Pressable>
          </View>

          {!isLoaded ? null : visibleJobs.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {jobs.length === 0 ? 'No applications yet' : 'No matches found'}
              </Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {jobs.length === 0
                  ? 'Add a role to start organizing your search.'
                  : 'Try a different search or status filter.'}
              </Text>
              {jobs.length === 0 ? (
                <Pressable
                  onPress={() => router.push('/add-job')}
                  style={({ pressed }) => [styles.emptyAddButton, pressed && styles.pressed]}
                >
                  <Text style={styles.emptyAddText}>Add application</Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => { setQuery(''); setFilter('All'); }}>
                  <Text style={[styles.clearFilters, { color: colors.text }]}>Clear filters</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.list}>
              {visibleJobs.map((job) => (
                <View
                  key={job.id}
                  style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={styles.cardTop}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${job.title} at ${job.company}`}
                      onPress={() => router.push({ pathname: '/add-job', params: { id: job.id } })}
                      style={({ pressed }) => [styles.cardCopy, pressed && styles.pressed]}
                    >
                      <Text style={[styles.jobTitle, { color: colors.text }]}>{job.title}</Text>
                      <Text style={[styles.company, { color: colors.muted }]}>
                        {job.company}{job.location ? ` · ${job.location}` : ''}
                      </Text>
                      {job.salary ? <Text style={[styles.salary, { color: colors.muted }]}>{job.salary}</Text> : null}
                      {job.notes ? <Text style={[styles.notes, { color: colors.muted }]} numberOfLines={2}>{job.notes}</Text> : null}
                      <Text style={[styles.date, { color: colors.muted }]}>
                        Added {new Date(job.createdAt).toLocaleDateString()}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${job.title}`}
                      onPress={() => setJobToRemove({ id: job.id, title: job.title })}
                      style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                    >
                      <Text style={{ color: colors.danger, fontSize: 20, fontWeight: '700' }}>×</Text>
                    </Pressable>
                  </View>

                  {job.applicationUrl && isHttpUrl(job.applicationUrl) ? (
                    <Link href={job.applicationUrl as Href} target="_blank" asChild>
                      <Pressable
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.applicationLink, pressed && styles.pressed]}
                      >
                        <Text style={styles.applicationLinkText}>Open job posting ↗</Text>
                      </Pressable>
                    </Link>
                  ) : null}

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusRow}>
                    {jobStatuses.map((status) => {
                      const selected = job.status === status;
                      return (
                        <Pressable
                          key={status}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => runStoreAction(() => updateJobStatus(job.id, status))}
                          style={[
                            styles.statusChip,
                            {
                              borderColor: selected ? '#20372C' : colors.border,
                              backgroundColor: selected ? '#20372C' : colors.surface,
                            },
                          ]}
                        >
                          <Text style={{ color: selected ? '#FFFFFF' : colors.text, fontSize: 12, fontWeight: '700' }}>
                            {status}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        transparent
        visible={jobToRemove !== null}
        animationType="fade"
        onRequestClose={() => setJobToRemove(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.confirmCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.confirmTitle, { color: colors.text }]}>Remove application?</Text>
            <Text style={[styles.confirmText, { color: colors.muted }]}>
              {jobToRemove ? `Remove ${jobToRemove.title} from your tracker?` : ''}
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setJobToRemove(null)}
                style={styles.cancelButton}
              >
                <Text style={[styles.cancelText, { color: colors.text }]}>Keep it</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (jobToRemove) {
                    runStoreAction(() => removeJob(jobToRemove.id));
                  }
                  setJobToRemove(null);
                }}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollView: { flex: 1 },
  contentContainer: { flexDirection: 'row', justifyContent: 'center' },
  container: { flexGrow: 1, maxWidth: MaxContentWidth, paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: 120 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.three },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.3, marginBottom: 5 },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.7 },
  addButton: { alignItems: 'center', backgroundColor: '#20372C', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  addButtonText: { color: '#FFFFFF', fontSize: 25, fontWeight: '600', marginTop: -2 },
  searchBox: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginBottom: Spacing.two, paddingHorizontal: 13 },
  searchIcon: { color: '#758078', fontSize: 23, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, minHeight: 48, paddingVertical: 10 },
  clearButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 32 },
  filters: { gap: 8, paddingBottom: Spacing.two },
  filter: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 },
  resultsRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.two },
  resultsText: { fontSize: 12 },
  sortText: { fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', borderRadius: 20, borderWidth: 1, padding: Spacing.four },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyText: { fontSize: 13, marginTop: 6, textAlign: 'center' },
  emptyAddButton: { backgroundColor: '#20372C', borderRadius: 12, marginTop: Spacing.three, paddingHorizontal: 18, paddingVertical: 12 },
  emptyAddText: { color: '#FFFFFF', fontWeight: '700' },
  clearFilters: { fontSize: 13, fontWeight: '800', marginTop: Spacing.three },
  list: { gap: 10 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#20372C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  cardTop: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  cardCopy: { flex: 1, paddingRight: 10 },
  jobTitle: { fontSize: 16, fontWeight: '800' },
  company: { fontSize: 13, marginTop: 4 },
  salary: { fontSize: 12, marginTop: 5 },
  notes: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  date: { fontSize: 11, marginTop: 7 },
  removeButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  statusRow: { gap: 7, marginTop: 12, paddingRight: 4 },
  statusChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  applicationLink: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4 },
  applicationLinkText: { color: '#49683D', fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.65 },
  errorBox: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.two, padding: 12 },
  errorText: { flex: 1, fontSize: 13, marginRight: Spacing.two },
  retryText: { fontSize: 13, fontWeight: '800' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', flex: 1, justifyContent: 'center', padding: Spacing.three },
  confirmCard: { borderRadius: 18, maxWidth: 380, padding: Spacing.three, width: '100%' },
  confirmTitle: { fontSize: 18, fontWeight: '800' },
  confirmText: { fontSize: 14, lineHeight: 20, marginTop: Spacing.two },
  confirmActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: Spacing.four },
  cancelButton: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  cancelText: { fontWeight: '700' },
  deleteButton: { backgroundColor: '#A85B5B', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 },
  deleteText: { color: '#FFFFFF', fontWeight: '800' },
});
