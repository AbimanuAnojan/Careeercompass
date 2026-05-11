const { generateGrokContent } = require("../config/grokClient");

const VALID_CLUSTERS = [
  "Technology & Engineering",
  "Medical & Life Sciences",
  "Business & Finance",
  "Humanities & Social Sciences",
  "Creative Arts & Design"
];

function asCleanString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function asStringArray(value, max = 12) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asCleanString(item))
    .filter(Boolean)
    .slice(0, max);
}

function normalize12thAnswers(rawAnswers) {
  const answers = rawAnswers && typeof rawAnswers === "object" ? rawAnswers : {};
  return {
    board: asCleanString(answers.board, "Unknown Board"),
    subjects: asStringArray(answers.subjects, 12),
    hlSubjects: asStringArray(answers.hlSubjects, 8),
    niosReason: asCleanString(answers.niosReason),
    interest: asCleanString(answers.interest),
    careerMind: asCleanString(answers.careerMind),
    studyTime: asCleanString(answers.studyTime),
    competitiveExams: asCleanString(answers.competitiveExams),
    preference: asCleanString(answers.preference)
  };
}

function parseJsonFromModelText(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Model response was empty.");
  }

  const stripped = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(stripped);
  } catch (_error) {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Model response did not contain valid JSON.");
    }
    return JSON.parse(stripped.slice(start, end + 1));
  }
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizePercentDistribution(items) {
  if (!Array.isArray(items) || !items.length) return [];

  const total = items.reduce((sum, item) => sum + clampPercent(item.percentage), 0);
  if (total <= 0) return [];

  const withRaw = items.map((item, index) => {
    const raw = (clampPercent(item.percentage) / total) * 100;
    const base = Math.floor(raw);
    return {
      index,
      cluster: item.cluster,
      base,
      remainder: raw - base
    };
  });

  let remaining = 100 - withRaw.reduce((sum, item) => sum + item.base, 0);
  const byRemainder = [...withRaw].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.index - b.index;
  });

  for (let i = 0; i < byRemainder.length && remaining > 0; i += 1) {
    byRemainder[i].base += 1;
    remaining -= 1;
  }

  const normalizedMap = new Map(byRemainder.map((item) => [item.cluster, item.base]));
  return items.map((item) => ({
    cluster: item.cluster,
    percentage: normalizedMap.get(item.cluster) || 0
  }));
}

function asValidCluster(value, fallback) {
  const cluster = asCleanString(value);
  return VALID_CLUSTERS.includes(cluster) ? cluster : fallback;
}

function normalizeMatchEntries(items) {
  const parsed = Array.isArray(items)
    ? items
        .map((item) => ({
          cluster: asCleanString(item?.cluster),
          percentage: clampPercent(item?.percentage)
        }))
        .filter((item) => item.cluster && item.percentage > 0)
    : [];

  const filtered = parsed.filter((item) => VALID_CLUSTERS.includes(item.cluster));
  const deduped = [];
  const seen = new Set();
  for (const item of filtered) {
    if (!seen.has(item.cluster)) {
      seen.add(item.cluster);
      deduped.push(item);
    }
  }
  return normalizePercentDistribution(deduped.slice(0, 5));
}

function normalizeBlueprintShape(blueprint, answers) {
  const input = blueprint && typeof blueprint === "object" ? blueprint : {};
  const matches = normalizeMatchEntries(input.careerDirectionMatch);

  const defaultMatches = matches.length
    ? matches
    : normalizePercentDistribution([
        { cluster: "Technology & Engineering", percentage: 30 },
        { cluster: "Business & Finance", percentage: 25 },
        { cluster: "Humanities & Social Sciences", percentage: 20 }
      ]);

  const sortedMatches = [...defaultMatches].sort((a, b) => b.percentage - a.percentage);
  const rankedClusterFallbacks = [...new Set([...sortedMatches.map((m) => m.cluster), ...VALID_CLUSTERS])];
  const defaultPrimary = rankedClusterFallbacks[0] || VALID_CLUSTERS[0];
  const defaultSecondary =
    rankedClusterFallbacks.find((cluster) => cluster !== defaultPrimary) || defaultPrimary;
  const defaultBackup =
    rankedClusterFallbacks.find(
      (cluster) => cluster !== defaultPrimary && cluster !== defaultSecondary
    ) || defaultSecondary;

  const primary = asValidCluster(input?.careerClusters?.primary, defaultPrimary);
  const secondary = asValidCluster(
    input?.careerClusters?.secondary,
    defaultSecondary === primary
      ? rankedClusterFallbacks.find((cluster) => cluster !== primary) || primary
      : defaultSecondary
  );
  const backup = asValidCluster(
    input?.careerClusters?.backup,
    rankedClusterFallbacks.find(
      (cluster) => cluster !== primary && cluster !== secondary
    ) || secondary
  );

  const boardStrategy = asCleanString(
    input.boardStrategy,
    `Focus on strong board performance in ${answers.board}, while aligning your effort with your target career direction.`
  );

  return {
    boardStrategy,
    careerDirectionMatch: sortedMatches,
    careerClusters: { primary, secondary, backup },
    suggestedCareers: asStringArray(input.suggestedCareers, 8),
    relevantExams: asStringArray(input.relevantExams, 8),
    roadmap: {
      immediateAction: asCleanString(input?.roadmap?.immediateAction, "Finalize your top 2 career targets and exam plan this week."),
      dailyPlan: asCleanString(input?.roadmap?.dailyPlan, "Study with a fixed daily timetable and weekly review."),
      keyFocusSubjects: asCleanString(
        input?.roadmap?.keyFocusSubjects,
        answers.subjects.join(", ") || "Core 12th subjects"
      ),
      prepMode: asCleanString(input?.roadmap?.prepMode, "Use mock tests, revision cycles, and mistake analysis.")
    },
    actionPlan: {
      rightNow: asCleanString(input?.actionPlan?.rightNow, "Balance board preparation with your entrance or admission targets."),
      afterBoards: asCleanString(input?.actionPlan?.afterBoards, "Use counseling and application windows strategically.")
    },
    smartSuggestion: asCleanString(
      input.smartSuggestion,
      "Stay consistent and avoid frequent strategy changes; track progress weekly."
    )
  };
}

function buildPrompt(answers) {
  return [
    "Generate a personalized Class 12 career blueprint for this student.",
    "Use only practical and realistic guidance for India-focused students.",
    "Return STRICT JSON only with this exact shape:",
    "{",
    '  "boardStrategy": "string",',
    '  "careerDirectionMatch": [{"cluster":"Technology & Engineering","percentage":32}],',
    '  "careerClusters": {"primary":"string","secondary":"string","backup":"string"},',
    '  "suggestedCareers": ["string"],',
    '  "relevantExams": ["string"],',
    '  "roadmap": {"immediateAction":"string","dailyPlan":"string","keyFocusSubjects":"string","prepMode":"string"},',
    '  "actionPlan": {"rightNow":"string","afterBoards":"string"},',
    '  "smartSuggestion": "string"',
    "}",
    "Rules:",
    "- careerDirectionMatch cluster values must be one of:",
    `  ${VALID_CLUSTERS.join(" | ")}`,
    "- percentages should be integers and add up to 100.",
    "- avoid hard score cutoffs or guaranteed outcomes; use cautious wording and ask the student to verify official eligibility/cutoffs from institution websites.",
    "- no markdown, no code fences, no extra keys.",
    "",
    `Student board: ${answers.board}`,
    `Subjects: ${answers.subjects.join(", ") || "Not specified"}`,
    `HL Subjects: ${answers.hlSubjects.join(", ") || "None"}`,
    `NIOS reason: ${answers.niosReason || "Not applicable"}`,
    `Interest type: ${answers.interest || "Not specified"}`,
    `Career in mind: ${answers.careerMind || "No, I want suggestions"}`,
    `Study time: ${answers.studyTime || "Not specified"}`,
    `Competitive exams: ${answers.competitiveExams || "Not specified"}`,
    `Preference: ${answers.preference || "Not specified"}`
  ].join("\n");
}

function extractModelText(response) {
  const choices = Array.isArray(response?.choices) ? response.choices : [];
  const text = choices[0]?.message?.content;
  if (typeof text === "string") return text.trim();
  return "";
}

async function generate12thBlueprint(answersPayload) {
  const answers = normalize12thAnswers(answersPayload);

  const messages = [
    {
      role: "system",
      content:
        "You are CareerCompass AI. Provide accurate, structured, and student-safe career guidance."
    },
    {
      role: "user",
      content: buildPrompt(answers)
    }
  ];

  const response = await generateGrokContent({ messages });
  const modelText = extractModelText(response);
  const parsed = parseJsonFromModelText(modelText);
  return normalizeBlueprintShape(parsed, answers);
}

module.exports = { generate12thBlueprint };
