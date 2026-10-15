// Trimester LMS content and demo data (matches the frontend demo content).
// The exported constants (WEEKS, LAB, LESSONS, QUIZ, ASSIGNMENTS) are shared with scripts/seed-lms-content.js,
// which loads them non-destructively. seedLms() itself wipes the LMS collections and must never run in production.
import {
  CodeLab, CodeSubmission, Cohort, Inquiry, LiveAttendance, LiveMessage, LiveSession,
  LmsAnnouncement, LmsProgress, LmsWeek, Trimester,
} from "./models/Lms.model.js";
import {
  Assignment, AssignmentSubmission, CommunityPost, CommunityReply, Lesson, LessonComment, LessonProgress,
  LmsCertificate, LmsQuiz, QuizAttempt,
} from "./models/LmsLearning.model.js";

import { dayKey } from "./utils/lmsSchedule.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Monday (00:00 UTC) of the current week
const mondayOfThisWeek = () => {
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday;
};

const items = (...entries) => entries.map(([kind, label, extra = {}]) => ({ kind, label, ...extra }));

export const WEEKS = [
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
      { dayIndex: 0, module: "Module 2.1", title: "Introduction to Graphs & Terminology", items: items(["video", "45m Video", { lessonRef: "intro-to-graphs" }], ["reading", "Reading (15m)"]) },
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
      { dayIndex: 0, module: "Module 4.1", title: "Overlapping Subproblems", items: items(["video", "45m Video", { lessonRef: "database-sharding" }], ["reading", "Reading (15m)", { lessonRef: "scalable-architecture-patterns" }]) },
      { dayIndex: 1, module: "Module 4.2", title: "Tabulation Patterns", items: items(["code", "Coding Lab (1.5h)"], ["check", "Knowledge Check", { lessonRef: "module-4-quiz" }]) },
      { dayIndex: 2, module: "Module 4.3", title: "Knapsack & Sequences", items: items(["live", "Live Lecture (2h)"], ["problems", "Problem Set 3"]) },
      { dayIndex: 3, module: "Module 4.4", title: "Trimester Revision", items: items(["review", "Peer Review"], ["check", "Mock Quiz"]) },
      { dayIndex: 4, module: "Assessment", title: "Final Assessment", items: items(["submission", "Final Submission"]) },
    ],
  },
];

export const LAB = {
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

export const LESSONS = [
  {
    slug: "intro-to-graphs",
    module: "Module 2.1",
    title: "Introduction to Graphs & Terminology",
    order: 21,
    videoId: "",
    durationMinutes: 45,
    intro: "Graphs model relationships: roads between cities, friends in a network, dependencies between tasks. This lesson introduces the vocabulary you will use for the rest of the week.",
    objectives: [
      "Define vertices, edges, degree, paths and cycles.",
      "Tell directed and undirected graphs apart.",
      "Choose between an adjacency matrix and an adjacency list for a given problem.",
    ],
    concepts: [
      { title: "Vertices and Edges", text: "A graph is a set of vertices (nodes) joined by edges. Edges can carry a direction and a weight." },
      { title: "Directed vs. Undirected", text: "In an undirected graph an edge works both ways; in a directed graph it only goes from one vertex to another." },
      { title: "Adjacency Matrix vs. List", text: "A matrix answers 'is there an edge?' in O(1) but uses O(V^2) space; a list uses O(V + E) space and is better for sparse graphs." },
    ],
    tip: "Draw the graph on paper first. Most traversal bugs come from misreading which way an edge points.",
    outro: "Finish the reading before the Module 2.2 coding lab, where you will build both representations in code.",
    file: { name: "Graph_Cheatsheet.pdf", sizeLabel: "1.1 MB" },
  },
  {
    slug: "scalable-architecture-patterns",
    module: "Module 4: Advanced Systems",
    title: "Lesson 4.2: Scalable Architecture Patterns",
    order: 42,
    videoId: "",
    durationMinutes: null,
    intro: "In this lesson, we explore the fundamental principles of scalable system design, moving beyond monolithic architectures into distributed environments.",
    objectives: [
      "Differentiate between horizontal and vertical scaling strategies.",
      "Identify the core components of a microservices architecture.",
      "Design a basic load-balanced system topology.",
    ],
    concepts: [
      { title: "Horizontal vs. Vertical Scaling", text: "Understanding when to add more power to an existing machine (vertical) versus adding more machines to a pool of resources (horizontal)." },
      { title: "Microservices Architecture", text: "Breaking down complex applications into smaller, independent services that communicate over well-defined APIs." },
      { title: "Load Balancing", text: "Distributing incoming network traffic across multiple servers to ensure no single server bears too much demand." },
    ],
    tip: "Always design for failure. In distributed systems, partial failures are inevitable. Implement robust retry mechanisms and circuit breakers.",
    outro: "Review the attached PDF for a deep dive into caching strategies using Redis and Memcached before moving to the next section.",
    file: { name: "Architecture_Diagrams.pdf", sizeLabel: "2.4 MB" },
  },
  {
    slug: "database-sharding",
    module: "Module 4: Advanced Systems",
    title: "Lesson 4.3: Database Sharding",
    order: 43,
    videoId: "",
    durationMinutes: 18,
    intro: "When a single database can no longer keep up, sharding splits the data across several machines. This lesson covers how to choose a shard key and what you give up in return.",
    objectives: [
      "Explain why and when a database is sharded.",
      "Compare range-based and hash-based shard keys.",
      "Describe the trade-offs of cross-shard queries.",
    ],
    concepts: [
      { title: "Shard Keys", text: "The shard key decides which machine stores a row. A poor key creates hot shards that take most of the traffic." },
      { title: "Range vs. Hash Sharding", text: "Range sharding keeps neighbouring keys together and helps range scans; hash sharding spreads load evenly." },
      { title: "Cross-shard Queries", text: "Joins and transactions that span shards are slower and harder to keep consistent, so design queries around the shard key." },
    ],
    tip: "Pick a shard key that matches how the data is read most often, not how it is written.",
    outro: "Next up is event-driven design, which pairs well with sharded data stores.",
    file: { name: "", sizeLabel: "" },
  },
];

export const QUIZ = {
  slug: "module-4-quiz",
  module: "Module 4: Advanced Systems",
  order: 99,
  passMark: 70,
  course: "Advanced Machine Learning Concepts",
  name: "Module 4 Quiz",
  minutes: 15,
  questions: [
    {
      prompt: "What does it mean when a machine learning model is overfitting?",
      hint: "Think about how the model behaves on data it has not seen before.",
      options: [
        "It performs well on training data but poorly on unseen data.",
        "It performs poorly on both training and unseen data.",
        "It trains faster than expected on large datasets.",
        "It cannot be improved by adding more data.",
      ],
      answer: 0,
    },
    {
      prompt: "Which of the following is a common technique for reducing overfitting?",
      hint: "Consider methods that constrain what the model can memorise.",
      options: [
        "Increasing the number of layers without limit.",
        "Applying regularization such as dropout or weight decay.",
        "Training for more epochs without monitoring validation loss.",
        "Removing the validation set to use more training data.",
      ],
      answer: 1,
    },
    {
      prompt: "In the context of Neural Networks, what is the primary purpose of the activation function?",
      hint: "Consider the role it plays in allowing the network to learn complex patterns.",
      options: [
        "To initialize the weights of the network before training begins.",
        "To introduce non-linearity into the output of a neuron.",
        "To normalize the input data to speed up the convergence of gradient descent.",
        "To compute the error between the predicted output and the actual target value.",
      ],
      answer: 1,
    },
    {
      prompt: "Which loss function is most commonly used for binary classification?",
      hint: "It compares predicted probabilities with the true 0/1 labels.",
      options: ["Mean squared error", "Binary cross-entropy", "Mean absolute error", "Huber loss"],
      answer: 1,
    },
    {
      prompt: "What does gradient descent do during training?",
      hint: "Think about how the parameters are updated at each step.",
      options: [
        "It randomly searches the parameter space for a lower loss.",
        "It adjusts parameters in the direction that reduces the loss.",
        "It removes features that have low variance.",
        "It splits the data into training and test sets.",
      ],
      answer: 1,
    },
    {
      prompt: "The vanishing gradient problem is most associated with which activation function in deep networks?",
      hint: "Its derivative becomes very small for large positive or negative inputs.",
      options: ["ReLU", "Sigmoid", "Identity (linear)", "Leaky ReLU"],
      answer: 1,
    },
    {
      prompt: "What is the main purpose of a validation set?",
      hint: "It is used while you are still developing the model.",
      options: [
        "To report the final performance of the model to stakeholders.",
        "To tune hyperparameters and monitor generalization during training.",
        "To increase the size of the training data.",
        "To store the trained weights.",
      ],
      answer: 1,
    },
    {
      prompt: "What does the learning rate control?",
      hint: "Too large and training diverges; too small and it crawls.",
      options: [
        "The number of layers in the network.",
        "The size of the parameter updates at each step.",
        "The proportion of data used for testing.",
        "The number of features fed to the model.",
      ],
      answer: 1,
    },
    {
      prompt: "Which of these is required for supervised learning?",
      hint: "The algorithm learns a mapping from inputs to known outputs.",
      options: [
        "Labeled examples of inputs and outputs.",
        "A reward signal from an environment.",
        "Only unlabeled data.",
        "A pre-trained language model.",
      ],
      answer: 0,
    },
    {
      prompt: "Which metric is usually more informative than accuracy when classes are heavily imbalanced?",
      hint: "Accuracy can look high even if the minority class is always missed.",
      options: ["Accuracy", "F1 score", "Training time", "Number of parameters"],
      answer: 1,
    },
  ],
};

export const ASSIGNMENTS = [
  {
    slug: "advanced-api-integration",
    module: "Module 3",
    title: "Advanced API Integration",
    summary: "Implement RESTful endpoints for user authentication and data retrieval using...",
    badge: "Module 3 Project",
    weekNumber: 3,
    dueDayIndex: 4,
    dueTime: "23:59",
    description: "In this assignment, you will build a robust RESTful API using Node.js and Express. Focus on secure authentication, efficient database querying, and proper error handling.",
    rubric: [
      { criterion: "Authentication and authorisation", points: 30 },
      { criterion: "Endpoint design and error handling", points: 30 },
      { criterion: "Database queries and performance", points: 25 },
      { criterion: "Code quality and documentation", points: 15 },
    ],
  },
  {
    slug: "database-schema-design",
    module: "Module 2",
    title: "Database Schema Design",
    summary: "Design a normalised schema for the course platform and justify your indexing choices.",
    badge: "Module 2 Project",
    weekNumber: 1,
    dueDayIndex: 4,
    dueTime: "23:59",
    description: "Design a normalised relational schema for a course platform, including entity relationships, constraints and indexes, and justify each design decision.",
    rubric: [
      { criterion: "Normalisation and relationships", points: 40 },
      { criterion: "Constraints and indexing", points: 30 },
      { criterion: "Written justification", points: 30 },
    ],
  },
  {
    slug: "ui-component-library",
    module: "Module 2",
    title: "UI Component Library",
    summary: "Build a small, accessible component library with documented props and usage examples.",
    badge: "Module 2 Project",
    weekNumber: 1,
    dueDayIndex: 2,
    dueTime: "23:59",
    description: "Build a small, accessible component library (buttons, inputs, modal) with documented props and usage examples.",
    rubric: [
      { criterion: "Component API and reusability", points: 40 },
      { criterion: "Accessibility", points: 35 },
      { criterion: "Documentation", points: 25 },
    ],
  },
];

export async function seedLms({ admin, jane, alice, bob }) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DESTRUCTIVE_SEED !== "true") {
    throw new Error("seedLms() deletes every LMS collection and is blocked in production. Use `npm run seed:lms` to load content safely.");
  }
  await Promise.all([
    Trimester, Cohort, LmsWeek, LmsProgress, LmsAnnouncement, Inquiry, LiveSession, LiveMessage, LiveAttendance, CodeLab, CodeSubmission,
    Lesson, LessonProgress, LessonComment, LmsQuiz, QuizAttempt, Assignment, AssignmentSubmission,
    CommunityPost, CommunityReply, LmsCertificate,
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
      status: "live", startedAt: new Date(now.getTime() - 20 * 60 * 1000),
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

  /* ---------- Lessons, quiz, assignments ---------- */
  await Lesson.insertMany(LESSONS.map((lesson) => ({ ...lesson, trimester: trimester._id })));
  await LmsQuiz.create({ ...QUIZ, trimester: trimester._id });

  // Dates are relative to the cohort start so the demo always shows one due soon and two in the past
  const tomorrowOffset = dayKey(new Date()) + 1 - dayKey(cohortStart);
  const dueTomorrow = { weekNumber: Math.floor(tomorrowOffset / 7) + 1, dueDayIndex: tomorrowOffset % 7 };
  const assignments = await Assignment.insertMany(
    ASSIGNMENTS.map((assignment) => ({ ...assignment, ...(assignment.slug === "advanced-api-integration" ? dueTomorrow : {}), trimester: trimester._id }))
  );
  const bySlug = Object.fromEntries(assignments.map((assignment) => [assignment.slug, assignment]));
  const longAgo = (days) => new Date(Date.now() - days * DAY_MS);
  await AssignmentSubmission.insertMany([
    {
      user: alice._id, cohort: cohort._id, assignment: bySlug["database-schema-design"]._id,
      text: "Normalised the schema to 3NF with separate tables for users, courses, enrolments and payments. Indexes cover the enrolment lookups by user and by course.",
      links: ["https://github.com/alice-student/course-schema"],
      status: "graded", score: 88, feedback: "Strong normalisation and clear justification. Add a composite index for the enrolment lookups next time.",
      rubricScores: [{ criterion: "Normalisation and relationships", points: 36 }, { criterion: "Constraints and indexing", points: 24 }, { criterion: "Written justification", points: 28 }],
      gradedBy: jane._id, gradedAt: longAgo(3), submittedAt: longAgo(6), late: false,
    },
    {
      user: alice._id, cohort: cohort._id, assignment: bySlug["ui-component-library"]._id,
      text: "Button, Input and Modal components with keyboard support, documented props and a Storybook-style usage page.",
      links: ["https://github.com/alice-student/ui-kit"],
      status: "submitted", submittedAt: longAgo(5), late: false,
    },
  ]);

  // Alice's quiz history: one failed attempt, so the attempt counter and the retry flow can be tried
  await QuizAttempt.create({
    user: alice._id, cohort: cohort._id, quiz: (await LmsQuiz.findOne({ trimester: trimester._id }))._id,
    answers: QUIZ.questions.map((question, index) => (index < 5 ? question.answer : 0)), score: 6, total: QUIZ.questions.length, passed: false, submittedAt: longAgo(2),
  });

  // Lesson progress and discussion
  const scalable = await Lesson.findOne({ trimester: trimester._id, slug: "scalable-architecture-patterns" });
  await LessonProgress.create({ user: alice._id, cohort: cohort._id, lesson: scalable._id, doneObjectives: [0] });
  const question = await LessonComment.create({
    lesson: scalable._id, cohort: cohort._id, author: alice._id, likes: [bob._id, jane._id],
    text: "How do we handle state in a truly stateless microservice architecture? Are we just relying entirely on external DBs?",
  });
  await LessonComment.create({
    lesson: scalable._id, cohort: cohort._id, author: jane._id, parent: question._id, likes: [alice._id],
    text: "Great question. Yes, typically state is pushed to distributed caches (like Redis) or managed databases. The service instances themselves remain ephemeral.",
  });

  /* ---------- Community ---------- */
  const posts = await CommunityPost.insertMany([
    { cohort: cohort._id, author: alice._id, channel: "general", tag: "Discussion", title: "Best resources for Advanced React patterns?", body: "I'm struggling a bit with the latest module on custom hooks and context API. Does anyone have good supplementary reading or tutorials they would recommend?", likes: [bob._id] },
    { cohort: cohort._id, author: jane._id, channel: "showcase", tag: "Showcase", title: "Mid-term Project Submissions are looking great!", body: "Just wanted to give a quick shoutout to the cohort. The level of detail in the recent UI prototypes is outstanding. Keep up the good work and don't forget to review the feedback rubric.", likes: [alice._id, bob._id], pinned: true },
    { cohort: cohort._id, author: bob._id, channel: "qa", tag: "Question", title: "Why does BFS use a queue but DFS a stack?", body: "I can follow both implementations but I can't explain why the data structure changes the traversal order. Can someone walk me through it?" },
    { cohort: cohort._id, author: alice._id, channel: "study", tag: "Study Group", title: "Graph theory study group, Thursday evening", body: "I'm organising an online session on Thursday at 7pm to work through the Week 2 problem set together. Reply if you want in.", likes: [] },
  ]);
  const replies = [
    { post: posts[0]._id, author: jane._id, body: "The React docs on custom hooks are the best start. Then try rebuilding useFetch from scratch." },
    { post: posts[0]._id, author: bob._id, body: "Seconding that. Kent C. Dodds' articles on context patterns also helped me a lot." },
    { post: posts[2]._id, author: alice._id, body: "A queue gives you first-in-first-out, so you finish a whole level before going deeper. A stack gives last-in-first-out, so you follow one path to the end first." },
  ];
  await CommunityReply.insertMany(replies);
  await CommunityPost.updateOne({ _id: posts[0]._id }, { replyCount: 2 });
  await CommunityPost.updateOne({ _id: posts[2]._id }, { replyCount: 1 });

  /* ---------- Certificates: alice finished Trimester 1 last term ---------- */
  const pastStart = new Date(cohortStart.getTime() - 120 * DAY_MS);
  const pastTrimester = await Trimester.create({
    name: "Trimester 1", programName: "Full-Stack Web Development", startsAt: pastStart,
    endsAt: new Date(pastStart.getTime() + 28 * DAY_MS), price: 150000, currency: "NGN", status: "ended",
  });
  const pastCohort = await Cohort.create({ name: "Cohort A", trimester: pastTrimester._id, instructor: jane._id, students: [alice._id], startsAt: pastStart, status: "archived" });
  await LmsCertificate.create({
    user: alice._id, cohort: pastCohort._id, trimester: pastTrimester._id, title: "Full-Stack Web Development",
    subtitle: "Trimester 1 Core Curriculum", badge: "Gloxad Certified", completedAt: new Date(pastStart.getTime() + 30 * DAY_MS), code: "GLX-DEMO01",
  });

  return { trimester, cohort };
}
