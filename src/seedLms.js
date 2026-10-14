// Demo data for the trimester LMS (matches the frontend demo content). Called from seed.js; never runs in production.
import {
  CodeLab, CodeSubmission, Cohort, Inquiry, LiveAttendance, LiveMessage, LiveSession,
  LmsAnnouncement, LmsProgress, LmsWeek, Trimester,
} from "./models/Lms.model.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Monday (00:00 UTC) of the current week
const mondayOfThisWeek = () => {
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday;
};

const items = (...entries) => entries.map(([kind, label, extra = {}]) => ({ kind, label, ...extra }));

const WEEKS = [
  {
    weekNumber: 1,
    objective: { title: "Complexity & Core Data Structures", text: "By the end of this week, you will analyse algorithm complexity with Big-O, and implement arrays, linked lists, stacks and queues from scratch." },
    estimatedHours: 10,
    concepts: ["Big-O", "Arrays", "Linked Lists", "Stacks & Queues"],
    days: [
      { dayIndex: 0, module: "Module 1.1", title: "Algorithm Analysis & Big-O", items: items(["video", "50m Video"], ["reading", "Reading (15m)"]) },
      { dayIndex: 1, module: "Module 1.2", title: "Arrays & Linked Lists", items: items(["code", "Coding Lab (1h)"], ["check", "Knowledge Check"]) },
      { dayIndex: 2, module: "Module 1.3", title: "Stacks & Queues", items: items(["live", "Live Lecture (2h)"], ["problems", "Problem Set 1"]) },
      { dayIndex: 3, module: "Module 1.4", title: "Recursion Patterns", items: items(["code", "Coding Lab (1.5h)"], ["review", "Peer Review"]) },
      { dayIndex: 4, module: "Assessment", title: "Weekly Challenge: Data Structure Toolkit", items: items(["submission", "Project Submission"]) },
    ],
  },
  {
    weekNumber: 2,
    objective: { title: "Mastering Graph Theory Fundamentals", text: "By the end of this week, you will confidently implement directed and undirected graphs, understand adjacency matrices vs. lists, and execute core traversal algorithms (BFS/DFS) to solve complex routing problems." },
    estimatedHours: 12,
    concepts: ["BFS", "DFS", "Dijkstra's", "Adjacency List"],
    days: [
      { dayIndex: 0, module: "Module 2.1", title: "Introduction to Graphs & Terminology", items: items(["video", "45m Video"], ["reading", "Reading (15m)"]) },
      { dayIndex: 1, module: "Module 2.2", title: "Graph Representations (Code)", items: items(["code", "Coding Lab (1h)", { labSlug: "graph-representations" }], ["check", "Knowledge Check"]) },
      { dayIndex: 2, module: "Module 2.3", title: "Breadth-First Search (BFS) Deep Dive", items: items(["live", "Live Lecture (2h)"], ["problems", "Problem Set 1"]) },
      { dayIndex: 3, module: "Module 2.4", title: "Depth-First Search (DFS) Variations", items: items(["code", "Coding Lab (1.5h)"], ["review", "Peer Review"]) },
      { dayIndex: 4, module: "Assessment", title: "Weekly Challenge: Graph Routing Project", items: items(["submission", "Project Submission"]) },
    ],
  },
  {
    weekNumber: 3,
    objective: { title: "Shortest Paths & Greedy Algorithms", text: "By the end of this week, you will apply Dijkstra's algorithm and greedy strategies to weighted graphs and justify when each approach is correct." },
    estimatedHours: 12,
    concepts: ["Dijkstra's", "Greedy", "Priority Queue", "Heaps"],
    days: [
      { dayIndex: 0, module: "Module 3.1", title: "Weighted Graphs & Priority Queues", items: items(["video", "40m Video"], ["reading", "Reading (20m)"]) },
      { dayIndex: 1, module: "Module 3.2", title: "Dijkstra's Algorithm", items: items(["code", "Coding Lab (1.5h)"], ["check", "Knowledge Check"]) },
      { dayIndex: 2, module: "Module 3.3", title: "Greedy Strategies", items: items(["live", "Live Lecture (2h)"], ["problems", "Problem Set 2"]) },
      { dayIndex: 3, module: "Module 3.4", title: "Minimum Spanning Trees", items: items(["code", "Coding Lab (1.5h)"], ["review", "Peer Review"]) },
      { dayIndex: 4, module: "Assessment", title: "Weekly Challenge: Network Cost Optimiser", items: items(["submission", "Project Submission"]) },
    ],
  },
  {
    weekNumber: 4,
    objective: { title: "Dynamic Programming & Review", text: "By the end of this week, you will recognise overlapping subproblems, build bottom-up solutions, and consolidate the trimester's topics for the final assessment." },
    estimatedHours: 14,
    concepts: ["Memoisation", "Tabulation", "Knapsack", "Revision"],
    days: [
      { dayIndex: 0, module: "Module 4.1", title: "Overlapping Subproblems", items: items(["video", "45m Video"], ["reading", "Reading (15m)"]) },
      { dayIndex: 1, module: "Module 4.2", title: "Tabulation Patterns", items: items(["code", "Coding Lab (1.5h)"], ["check", "Knowledge Check"]) },
      { dayIndex: 2, module: "Module 4.3", title: "Knapsack & Sequences", items: items(["live", "Live Lecture (2h)"], ["problems", "Problem Set 3"]) },
      { dayIndex: 3, module: "Module 4.4", title: "Trimester Revision", items: items(["review", "Peer Review"], ["check", "Mock Quiz"]) },
      { dayIndex: 4, module: "Assessment", title: "Final Assessment", items: items(["submission", "Final Submission"]) },
    ],
  },
];

const LAB = {
  slug: "graph-representations",
  title: "Coding Lab: Graph Representations",
  module: "Module 2.2",
  estimate: "1h",
  steps: [
    "Implement buildAdjacencyList(edges, directed) so it returns an object that maps every node to the list of nodes it connects to.",
    "For undirected graphs, add the edge in both directions. For directed graphs, still create an empty list for nodes that have no outgoing edges.",
    "Implement bfs(graph, start) so it returns the nodes in the order a breadth-first search visits them.",
    "Press Run (or Ctrl/Cmd + Enter) to check your work against the tests.",
  ],
  hints: [
    "Use an array as a queue: push to add, shift to take from the front.",
    "Keep a Set of visited nodes so you never visit a node twice.",
    "Nodes can appear only as the target of an edge, so create their entry too.",
  ],
  files: [
    {
      name: "graph.js",
      language: "javascript",
      content: `// Module 2.2: Graph Representations
// 1) Build an adjacency list from an edge list.
// 2) Implement breadth-first search on it.

function buildAdjacencyList(edges, directed = false) {
  // TODO: return an object like { A: ["B", "C"], B: ["A"], C: ["A"] }
}

function bfs(graph, start) {
  // TODO: return the nodes in the order BFS visits them
}

// Try things out here. console.log output shows in the Console tab.
console.log(buildAdjacencyList([["A", "B"], ["A", "C"]]));
`,
    },
    {
      name: "tests.js",
      language: "javascript",
      readOnly: true,
      content: `// These tests run against your graph.js. You can read them but not edit them.

test("builds an undirected adjacency list", () => {
  assertEqual(buildAdjacencyList([["A", "B"], ["A", "C"]]), { A: ["B", "C"], B: ["A"], C: ["A"] });
});

test("builds a directed adjacency list", () => {
  assertEqual(buildAdjacencyList([["A", "B"]], true), { A: ["B"], B: [] });
});

test("bfs visits nodes level by level", () => {
  const graph = { A: ["B", "C"], B: ["D"], C: ["D"], D: [] };
  assertEqual(bfs(graph, "A"), ["A", "B", "C", "D"]);
});

test("bfs skips unreachable nodes", () => {
  assertEqual(bfs({ A: ["B"], B: [], C: [] }, "A"), ["A", "B"]);
});
`,
    },
  ],
};

export async function seedLms({ admin, jane, alice, bob }) {
  await Promise.all([
    Trimester, Cohort, LmsWeek, LmsProgress, LmsAnnouncement, Inquiry, LiveSession, LiveMessage, LiveAttendance, CodeLab, CodeSubmission,
  ].map((model) => model.deleteMany({})));

  // Week 2 is the current week, so "today" falls inside the plan whatever day you seed on
  const cohortStart = new Date(mondayOfThisWeek().getTime() - 7 * DAY_MS);

  const trimester = await Trimester.create({
    name: "Trimester 2",
    programName: "Data Structures & Algorithms",
    startsAt: cohortStart,
    endsAt: new Date(cohortStart.getTime() + 28 * DAY_MS),
    price: 150000,
    currency: "NGN",
    status: "running",
  });

  const cohort = await Cohort.create({
    name: "Cohort B",
    trimester: trimester._id,
    instructor: jane._id,
    students: [alice._id, bob._id],
    startsAt: cohortStart,
  });

  await LmsWeek.insertMany(WEEKS.map((week) => ({ ...week, trimester: trimester._id })));
  await CodeLab.create({ ...LAB, trimester: trimester._id });

  // Alice has finished all of week 1
  const week1 = await LmsWeek.findOne({ trimester: trimester._id, weekNumber: 1 });
  await LmsProgress.create({
    user: alice._id,
    cohort: cohort._id,
    completedItems: week1.days.flatMap((day) => day.items.map((item) => item._id)),
  });

  const now = new Date();
  const [live, upcoming, past] = await LiveSession.insertMany([
    {
      cohort: cohort._id, title: "Data Structures: Advanced Trees & Graphs", instructor: jane._id,
      startsAt: new Date(now.getTime() - 20 * 60 * 1000), endsAt: new Date(now.getTime() + 70 * 60 * 1000),
      status: "live", startedAt: new Date(now.getTime() - 20 * 60 * 1000), roomName: "lms-demo-live",
      sharedCode: { language: "javascript", updatedAt: now, content: `function bfs(graph, start) {\n  const visited = new Set([start]);\n  const queue = [start];\n  const order = [];\n\n  while (queue.length > 0) {\n    const node = queue.shift();\n    order.push(node);\n\n    for (const next of graph[node] ?? []) {\n      if (!visited.has(next)) {\n        visited.add(next);\n        queue.push(next);\n      }\n    }\n  }\n  return order; // O(V + E)\n}` },
    },
    {
      cohort: cohort._id, title: "Machine Learning 101", instructor: jane._id,
      startsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), endsAt: new Date(now.getTime() + 26 * 60 * 60 * 1000), status: "scheduled",
    },
    {
      cohort: cohort._id, title: "Big-O & Complexity Workshop", instructor: jane._id,
      startsAt: new Date(now.getTime() - 6 * DAY_MS), endsAt: new Date(now.getTime() - 6 * DAY_MS + 2 * 60 * 60 * 1000),
      status: "ended", startedAt: new Date(now.getTime() - 6 * DAY_MS), endedAt: new Date(now.getTime() - 6 * DAY_MS + 2 * 60 * 60 * 1000),
    },
  ]);
  await LiveAttendance.create({ session: past._id, user: alice._id });
  await LiveMessage.insertMany([
    { session: live._id, author: bob._id, text: "Could you explain the time complexity of the last traversal method again?" },
    { session: live._id, author: alice._id, text: "I think it's O(V+E) for BFS." },
    { session: live._id, system: true, text: "Instructor launched a poll" },
  ]);
  live.polls.push({
    question: "What is the time complexity of BFS on a graph with V vertices and E edges?",
    options: ["O(V)", "O(V + E)", "O(V × E)", "O(log V)"].map((text) => ({ text, voters: [] })),
  });
  await live.save();

  await LmsAnnouncement.insertMany([
    { cohort: cohort._id, author: jane._id, title: "Class schedule updated", text: "Thursday's live session has been moved to 10:00 AM EST to avoid a clash with the guest talk." },
    { cohort: cohort._id, author: jane._id, title: "Assignment 4 Tips posted", text: "Check the resources folder for supplementary materials on API design before you start." },
  ]);

  await Inquiry.insertMany([
    { reference: "INQ-DEMO-0001", user: alice._id, cohort: cohort._id, category: "technical", subject: "Cannot access Week 3 Module", description: "The Week 3 module shows as locked on my dashboard even though I finished Week 2.", status: "pending" },
    { reference: "INQ-DEMO-0002", user: alice._id, cohort: cohort._id, category: "billing", subject: "Invoice #4402 Correction", description: "My invoice shows the wrong billing name, please correct it.", status: "resolved", replies: [{ author: admin._id, message: "Corrected and re-sent to your email." }] },
    { reference: "INQ-DEMO-0003", user: alice._id, cohort: cohort._id, category: "academics", subject: "Extension for Assignment 1", description: "I was unwell last week and would like a short extension for Assignment 1.", status: "resolved", replies: [{ author: jane._id, message: "Extension granted until Friday." }] },
  ]);

  return { trimester, cohort };
}
