// Turns a weekly plan + a cohort start date + a student's progress into what the screens show.

const DAY_MS = 24 * 60 * 60 * 1000;
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// "Today" is evaluated in the programme's timezone (default WAT, UTC+1) so a day doesn't flip at 11pm local time.
const tzOffsetMs = () => (Number(process.env.LMS_TZ_OFFSET_MINUTES ?? 60) || 0) * 60 * 1000;
export const dayKey = (date) => Math.floor((new Date(date).getTime() + tzOffsetMs()) / DAY_MS);

export const dayDate = (cohort, weekNumber, dayIndex) =>
  new Date(new Date(cohort.startsAt).getTime() + ((weekNumber - 1) * 7 + dayIndex) * DAY_MS);

/** Week number (1-based, clamped to 1..totalWeeks) that contains `now` for this cohort. */
export const currentWeekNumber = (cohort, totalWeeks, now = new Date()) => {
  const elapsed = dayKey(now) - dayKey(cohort.startsAt);
  return Math.min(Math.max(Math.floor(elapsed / 7) + 1, 1), Math.max(totalWeeks, 1));
};

const isDone = (doneSet, id) => doneSet.has(String(id));

/**
 * @returns the week as the API exposes it: seven day slots (Mon-Sun) with a status, plus progress numbers.
 * Day status: done | today | available (past, unfinished) | upcoming (future, not yet open) | locked (nothing scheduled)
 */
export const decorateWeek = (week, cohort, doneSet, now = new Date()) => {
  const todayKey = dayKey(now);
  const byIndex = new Map(week.days.map((day) => [day.dayIndex, day]));
  let totalItems = 0;
  let doneItems = 0;

  const days = DAY_NAMES.map((name, dayIndex) => {
    const source = byIndex.get(dayIndex);
    const date = dayDate(cohort, week.weekNumber, dayIndex);
    if (!source || !source.title) {
      return { day: name, dayIndex, date, status: "locked", module: null, title: null, progress: 0, items: [] };
    }

    const items = source.items.map((item) => ({
      _id: item._id,
      kind: item.kind,
      label: item.label,
      labSlug: item.labSlug || null,
      lessonRef: item.lessonRef || null,
      done: isDone(doneSet, item._id),
    }));
    const done = items.filter((item) => item.done).length;
    totalItems += items.length;
    doneItems += done;

    const thisKey = dayKey(date);
    let status = "upcoming";
    if (items.length > 0 && done === items.length) status = "done";
    else if (thisKey === todayKey) status = "today";
    else if (thisKey < todayKey) status = "available";

    return {
      day: name,
      dayIndex,
      date,
      status,
      module: source.module || null,
      title: source.title,
      progress: items.length ? Math.round((done / items.length) * 100) : 0,
      items,
    };
  });

  return {
    weekNumber: week.weekNumber,
    objective: week.objective,
    estimatedHours: week.estimatedHours,
    concepts: week.concepts,
    progress: totalItems ? Math.round((doneItems / totalItems) * 100) : 0,
    totalItems,
    doneItems,
    days,
  };
};

/** Flat, date-ordered list of every scheduled item in the plan (used for "up next" and "upcoming"). */
export const flattenItems = (weeks, cohort, doneSet) => {
  const rows = [];
  for (const week of weeks) {
    for (const day of week.days) {
      if (!day.title) continue;
      const date = dayDate(cohort, week.weekNumber, day.dayIndex);
      for (const item of day.items) {
        rows.push({
          _id: item._id,
          kind: item.kind,
          label: item.label,
          labSlug: item.labSlug || null,
          lessonRef: item.lessonRef || null,
          weekNumber: week.weekNumber,
          dayIndex: day.dayIndex,
          day: DAY_NAMES[day.dayIndex],
          module: day.module || null,
          title: day.title,
          date,
          done: isDone(doneSet, item._id),
        });
      }
    }
  }
  return rows.sort((a, b) => a.date - b.date || a.weekNumber - b.weekNumber || a.dayIndex - b.dayIndex);
};

/** An item may be completed once its day has started. */
export const isItemUnlocked = (itemDate, now = new Date()) => dayKey(itemDate) <= dayKey(now);
