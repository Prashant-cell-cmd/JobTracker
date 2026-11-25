import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { DashboardIllustration } from '@/components/dashboard-illustration';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { useJobStore, type JobStatus } from '../../hooks/use-job-store';

const dashboardStatuses: { label: string; status: JobStatus; color: string }[] = [
  { label: 'Applied', status: 'Applied', color: '#91A8FF' },
  { label: 'Interviews', status: 'Interview', color: '#FFC66D' },
  { label: 'Offers', status: 'Offer', color: '#73D4A8' },
  { label: 'Closed', status: 'Rejected', color: '#E7948C' },
];

const companyColors = ['#E6F0DF', '#E5E9FC', '#F8EBD6', '#F7E5E4'];

type ActivityDay = {
  date: Date;
  label: string;
  count: number;
};

function getCompanyMark(company: string): string {
  return company
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}

function makeWeekActivity(jobs: { createdAt: string }[]): ActivityDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const nextDay = new Date(date);
    nextDay.setDate(date.getDate() + 1);
    const count = jobs.filter((job) => {
      const createdAt = new Date(job.createdAt).getTime();
      return createdAt >= date.getTime() && createdAt < nextDay.getTime();
    }).length;

    return {
      date,
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
      count,
    };
  });
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { session, signOut } = useAuth();
  const { jobs, isLoaded, error, reload } = useJobStore();
  const [selectedDayIndex, setSelectedDayIndex] = useState(6);
  const isDark = theme.background === '#000000';
  const colors = {
    background: isDark ? '#101411' : '#F5F7F4',
    surface: isDark ? '#191F1B' : '#FFFFFF',
    border: isDark ? '#29312B' : '#E5EAE3',
    text: isDark ? '#F1F5F1' : '#202923',
    muted: isDark ? '#A0ACA3' : '#758078',
    danger: '#A85B5B',
  };
  const statusCounts = dashboardStatuses.map((status) => ({
    ...status,
    count: jobs.filter((job) => job.status === status.status).length,
  }));
  const weekActivity = useMemo(() => makeWeekActivity(jobs), [jobs]);
  const weeklyTotal = weekActivity.reduce((sum, day) => sum + day.count, 0);
  const maxActivity = Math.max(1, ...weekActivity.map((day) => day.count));
  const selectedDay = weekActivity[selectedDayIndex] ?? weekActivity[6];
  const ringCircumference = 2 * Math.PI * 39;
  const ringOffsets = statusCounts.map((_, index) =>
    statusCounts
      .slice(0, index)
      .reduce((offset, status) => offset + ringCircumference * status.count / Math.max(1, jobs.length), 0),
  );
  const recentJobs = [...jobs]
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    .slice(0, 3);

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: colors.background }]}
      contentInset={{
        top: insets.top,
        bottom: insets.bottom + BottomTabInset + 100,
        left: insets.left,
        right: insets.right,
      }}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.muted }]}>YOUR CAREER DASHBOARD</Text>
            <Text style={[styles.pageTitle, { color: colors.text }]}>JobTracker</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityLabel={`Signed in as ${session?.user.email ?? ''}`}
              accessibilityRole="button"
              onPress={() => router.push('/profile')}
              style={styles.accountButton}
            >
              <Text style={styles.accountInitial}>
                {(session?.user.email[0] ?? 'J').toUpperCase()}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              onPress={() => void signOut()}
              style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
            >
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add application"
              onPress={() => router.push('/add-job')}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            >
              <Text style={styles.headerButtonText}>+</Text>
            </Pressable>
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

        <View style={styles.sectionHeading}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent applications</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
              {isLoaded ? `${jobs.length} role${jobs.length === 1 ? '' : 's'} in your tracker` : 'Syncing your tracker'}
            </Text>
          </View>
          {jobs.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/explore')}
              style={({ pressed }) => [styles.textLinkButton, pressed && styles.pressed]}
            >
              <Text style={styles.sectionLink}>See all</Text>
              <Text style={styles.sectionLinkArrow}>›</Text>
            </Pressable>
          ) : null}
        </View>

        {!isLoaded ? null : jobs.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.emptyIllustration}>
              <DashboardIllustration />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>A fresh start</Text>
            <Text style={[styles.emptyDescription, { color: colors.muted }]}>
              Add your first role and watch your search take shape.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/add-job')}
              style={({ pressed }) => [styles.emptyAddButton, pressed && styles.pressed]}
            >
              <Text style={styles.emptyAddButtonText}>+ Add your first application</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.jobList}>
            {recentJobs.map((job, index) => {
              const statusColor = dashboardStatuses.find((item) => item.status === job.status)?.color ?? '#91A8FF';
              return (
                <Pressable
                  key={job.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${job.title} at ${job.company}`}
                  onPress={() => router.push({ pathname: '/add-job', params: { id: job.id } })}
                  style={({ pressed }) => [
                    styles.jobCard,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    pressed && styles.statCardPressed,
                  ]}
                >
                  <View style={[styles.companyBadge, { backgroundColor: companyColors[index % companyColors.length] }]}>
                    <Text style={styles.companyBadgeText}>{getCompanyMark(job.company) || 'J'}</Text>
                  </View>
                  <View style={styles.jobCopy}>
                    <Text style={[styles.jobTitle, { color: colors.text }]} numberOfLines={1}>
                      {job.title}
                    </Text>
                    <Text style={[styles.jobCompany, { color: colors.muted }]} numberOfLines={1}>
                      {job.company}{job.location ? ` · ${job.location}` : ''}
                    </Text>
                  </View>
                  <View style={styles.jobMeta}>
                    <View style={[styles.jobStatusDot, { backgroundColor: statusColor }]} />
                    <Text style={[styles.jobStatus, { color: colors.muted }]}>{job.status}</Text>
                  </View>
                  <Text style={[styles.jobArrow, { color: colors.muted }]}>›</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <View style={styles.heroEyebrowRow}>
              <View style={styles.heroEyebrowDot} />
              <Text style={styles.heroEyebrow}>YOUR SEARCH, IN MOTION</Text>
            </View>
            <Text style={styles.heroTitle}>Small steps. Big wins.</Text>
            <Text style={styles.heroSubtitle}>
              Make your next opportunity easier to find.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/add-job')}
              style={({ pressed }) => [styles.heroButton, pressed && styles.pressed]}
            >
              <Text style={styles.heroButtonText}>Track a new role</Text>
              <Text style={styles.heroButtonArrow}>↗</Text>
            </Pressable>
          </View>
          <View style={styles.heroArtwork}>
            <DashboardIllustration />
            <View style={styles.artworkBadge}>
              <Text style={styles.artworkBadgeIcon}>✦</Text>
              <Text style={styles.artworkBadgeText}>{weeklyTotal} this week</Text>
            </View>
          </View>
          <View style={styles.heroOrb} />
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Your pipeline</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
              Tap a stage to explore your roles
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/explore')}
            style={({ pressed }) => [styles.textLinkButton, pressed && styles.pressed]}
          >
            <Text style={styles.sectionLink}>View all</Text>
            <Text style={styles.sectionLinkArrow}>›</Text>
          </Pressable>
        </View>

        <View style={[styles.pipelineCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View
            accessibilityLabel={`${jobs.length} total applications in your pipeline`}
            accessibilityRole="image"
            style={styles.ringContainer}
          >
            <Svg height={118} viewBox="0 0 100 100" width={118}>
              <Circle
                cx="50"
                cy="50"
                fill="none"
                r="39"
                stroke={isDark ? '#2D3830' : '#EDF0E9'}
                strokeWidth="10"
              />
              {statusCounts.map((status, index) => {
                const segmentLength = jobs.length ? ringCircumference * status.count / jobs.length : 0;
                const dashLength = Math.max(0, segmentLength - (status.count ? 3 : 0));
                const offset = ringOffsets[index] ?? 0;
                return status.count ? (
                  <Circle
                    key={status.status}
                    cx="50"
                    cy="50"
                    fill="none"
                    r="39"
                    transform="rotate(-90 50 50)"
                    stroke={status.color}
                    strokeDasharray={`${dashLength} ${ringCircumference}`}
                    strokeDashoffset={-offset}
                    strokeLinecap="round"
                    strokeWidth="10"
                  />
                ) : null;
              })}
            </Svg>
            <View style={styles.ringCenter}>
              <Text style={[styles.ringValue, { color: colors.text }]}>{jobs.length}</Text>
              <Text style={[styles.ringLabel, { color: colors.muted }]}>tracked</Text>
            </View>
          </View>
          <View style={styles.pipelineLegend}>
            {statusCounts.map((status) => (
              <Pressable
                key={status.status}
                accessibilityRole="button"
                accessibilityLabel={`${status.count} ${status.label} applications; view results`}
                onPress={() => router.push({ pathname: '/explore', params: { status: status.status } })}
                style={({ pressed }) => [styles.legendRow, pressed && styles.pressed]}
              >
                <View style={[styles.legendDot, { backgroundColor: status.color }]} />
                <Text numberOfLines={1} style={[styles.legendLabel, { color: colors.muted }]}>
                  {status.label}
                </Text>
                <Text style={[styles.legendCount, { color: colors.text }]}>{status.count}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>At a glance</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>Your latest progress</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          {statusCounts.map((stat, index) => (
            <Pressable
              key={stat.status}
              accessibilityRole="button"
              accessibilityLabel={`${stat.count} ${stat.label} applications; view results`}
              onPress={() => router.push({ pathname: '/explore', params: { status: stat.status } })}
              style={({ pressed }) => [
                styles.statCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && styles.statCardPressed,
              ]}
            >
              <View style={[styles.statIcon, { backgroundColor: companyColors[index] }]}>
                <Text style={[styles.statIconText, { color: '#314A38' }]}>
                  {['↗', '✳', '★', '✓'][index]}
                </Text>
              </View>
              <Text style={[styles.statValue, { color: colors.text }]}>{stat.count}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>{stat.label}</Text>
              <Text style={[styles.statArrow, { color: colors.muted }]}>↗</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.activityCard}>
          <View style={styles.activityHeader}>
            <View>
              <Text style={styles.activityTitle}>Weekly activity</Text>
              <Text style={styles.activityCaption}>
                {selectedDay
                  ? `${selectedDay.label} · ${selectedDay.count} added`
                  : 'Your applications this week'}
              </Text>
            </View>
            <View style={styles.weekBadge}>
              <Text style={styles.weekBadgeSpark}>✦</Text>
              <Text style={styles.weekBadgeText}>{weeklyTotal} this week</Text>
            </View>
          </View>
          <View style={styles.activityChart}>
            {weekActivity.map((day, index) => {
              const selected = index === selectedDayIndex;
              const barHeight = day.count
                ? Math.max(12, day.count / maxActivity * 68)
                : 5;
              return (
                <Pressable
                  key={day.date.toISOString()}
                  accessibilityRole="button"
                  accessibilityLabel={`${day.label}: ${day.count} applications added`}
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedDayIndex(index)}
                  style={({ pressed }) => [styles.activityDay, pressed && styles.pressed]}
                >
                  <View style={styles.activityBarArea}>
                    <View
                      style={[
                        styles.activityBar,
                        {
                          backgroundColor: selected ? '#C6F36A' : isDark ? '#39463A' : '#DDE8D8',
                          height: barHeight,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.activityDayLabel, selected && styles.activityDayLabelSelected]}>
                    {day.label.slice(0, 1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  contentContainer: { flexDirection: 'row', justifyContent: 'center' },
  container: {
    flexGrow: 1,
    maxWidth: MaxContentWidth,
    paddingBottom: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.four,
  },
  headerCopy: { flexShrink: 1 },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  accountButton: {
    alignItems: 'center',
    backgroundColor: '#E1EBDD',
    borderRadius: 19,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  accountInitial: { color: '#35503D', fontSize: 15, fontWeight: '800' },
  signOutButton: { paddingHorizontal: 2, paddingVertical: 8 },
  signOutText: { color: '#758078', fontSize: 11, fontWeight: '700' },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 5 },
  pageTitle: { fontSize: 27, fontWeight: '800', letterSpacing: -0.7 },
  headerButton: {
    alignItems: 'center',
    backgroundColor: '#20372C',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerButtonText: { color: '#FFFFFF', fontSize: 25, fontWeight: '600', marginTop: -2 },
  hero: {
    backgroundColor: '#20372C',
    borderRadius: 26,
    flexDirection: 'row',
    marginBottom: 27,
    minHeight: 208,
    overflow: 'hidden',
    padding: 19,
    position: 'relative',
  },
  heroCopy: { flex: 1, justifyContent: 'center', maxWidth: '64%', zIndex: 2 },
  heroEyebrowRow: { alignItems: 'center', flexDirection: 'row', gap: 7, marginBottom: 11 },
  heroEyebrowDot: { backgroundColor: '#C6F36A', borderRadius: 4, height: 7, width: 7 },
  heroEyebrow: { color: '#C6F36A', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  heroTitle: { color: '#F6F8F2', fontSize: 26, fontWeight: '800', letterSpacing: -0.8, lineHeight: 30 },
  heroSubtitle: { color: '#D1DCD1', fontSize: 12, lineHeight: 18, marginTop: 9, maxWidth: 210 },
  heroButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#C6F36A',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    minHeight: 40,
    paddingHorizontal: 13,
  },
  heroButtonText: { color: '#20372C', fontSize: 12, fontWeight: '800' },
  heroButtonArrow: { color: '#20372C', fontSize: 15, fontWeight: '800' },
  heroArtwork: { alignItems: 'center', height: 160, justifyContent: 'center', pointerEvents: 'none', position: 'absolute', right: 3, top: 24, width: 155, zIndex: 1 },
  heroOrb: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 100,
    height: 155,
    position: 'absolute',
    pointerEvents: 'none',
    right: -55,
    top: -73,
    width: 155,
  },
  artworkBadge: {
    alignItems: 'center',
    backgroundColor: '#F8F8F0',
    borderColor: '#DDE7D5',
    borderRadius: 11,
    borderWidth: 1,
    bottom: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    position: 'absolute',
    right: 0,
  },
  artworkBadgeIcon: { color: '#64844D', fontSize: 11 },
  artworkBadgeText: { color: '#354A38', fontSize: 9, fontWeight: '800' },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 13,
    marginTop: 2,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  sectionSubtitle: { fontSize: 11, marginTop: 3 },
  textLinkButton: { alignItems: 'center', flexDirection: 'row', gap: 2, padding: 7 },
  sectionLink: { color: '#527044', fontSize: 12, fontWeight: '800' },
  sectionLinkArrow: { color: '#527044', fontSize: 20, lineHeight: 20 },
  pipelineCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5EAE3',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 26,
    minHeight: 150,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  ringContainer: { alignItems: 'center', height: 118, justifyContent: 'center', width: 118 },
  ringCenter: { alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', position: 'absolute' },
  ringValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.8 },
  ringLabel: { fontSize: 10, fontWeight: '600', marginTop: -2 },
  pipelineLegend: { flex: 1, gap: 10, maxWidth: 178, paddingLeft: 8 },
  legendRow: { alignItems: 'center', flexDirection: 'row', minHeight: 20 },
  legendDot: { borderRadius: 4, height: 8, marginRight: 8, width: 8 },
  legendLabel: { flex: 1, fontSize: 11, fontWeight: '600' },
  legendCount: { fontSize: 12, fontWeight: '800', paddingLeft: 8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 25 },
  statCard: {
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 128,
    overflow: 'hidden',
    padding: 13,
    position: 'relative',
  },
  statCardPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  statIcon: { alignItems: 'center', borderRadius: 12, height: 31, justifyContent: 'center', width: 31 },
  statIconText: { fontSize: 16, fontWeight: '800' },
  statValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginTop: 10 },
  statLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  statArrow: { fontSize: 13, fontWeight: '800', position: 'absolute', right: 13, top: 13 },
  activityCard: {
    backgroundColor: '#263F31',
    borderRadius: 22,
    marginBottom: 26,
    paddingHorizontal: 17,
    paddingTop: 17,
  },
  activityHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  activityTitle: { color: '#F5F8F2', fontSize: 15, fontWeight: '800' },
  activityCaption: { color: '#B9C9BA', fontSize: 11, marginTop: 4 },
  weekBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  weekBadgeSpark: { color: '#C6F36A', fontSize: 11 },
  weekBadgeText: { color: '#F5F8F2', fontSize: 10, fontWeight: '700' },
  activityChart: { alignItems: 'flex-end', flexDirection: 'row', height: 124, justifyContent: 'space-around', paddingTop: 13 },
  activityDay: { alignItems: 'center', flex: 1, height: 111, justifyContent: 'flex-end', paddingHorizontal: 5 },
  activityBarArea: { alignItems: 'center', height: 78, justifyContent: 'flex-end', width: '100%' },
  activityBar: { borderRadius: 7, maxWidth: 24, minWidth: 14, width: '75%' },
  activityDayLabel: { color: '#B9C9BA', fontSize: 10, fontWeight: '700', marginTop: 8 },
  activityDayLabelSelected: { color: '#C6F36A' },
  emptyCard: { alignItems: 'center', borderRadius: 21, borderWidth: 1, padding: 19 },
  emptyIllustration: { height: 112, marginBottom: 3, overflow: 'hidden', width: 112 },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 3 },
  emptyDescription: { fontSize: 12, lineHeight: 18, marginTop: 6, maxWidth: 290, textAlign: 'center' },
  emptyAddButton: { alignItems: 'center', backgroundColor: '#20372C', borderRadius: 12, marginTop: 15, paddingHorizontal: 17, paddingVertical: 12 },
  emptyAddButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  jobList: { gap: 9 },
  jobCard: {
    alignItems: 'center',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 74,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  companyBadge: { alignItems: 'center', borderRadius: 14, height: 43, justifyContent: 'center', marginRight: 11, width: 43 },
  companyBadgeText: { color: '#405A43', fontSize: 13, fontWeight: '900' },
  jobCopy: { flex: 1, paddingRight: 7 },
  jobTitle: { fontSize: 13, fontWeight: '800' },
  jobCompany: { fontSize: 11, marginTop: 4 },
  jobMeta: { alignItems: 'flex-end', gap: 5 },
  jobStatusDot: { borderRadius: 4, height: 7, width: 7 },
  jobStatus: { fontSize: 9, fontWeight: '700' },
  jobArrow: { fontSize: 22, marginLeft: 8 },
  pressed: { opacity: 0.7 },
  errorBox: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.two, padding: 12 },
  errorText: { flex: 1, fontSize: 13, marginRight: Spacing.two },
  retryText: { fontSize: 13, fontWeight: '800' },
});
