/* eslint-disable @typescript-eslint/no-explicit-any */

// --- TYPES ---
export type Operator = "equals" | "notEquals" | "contains";

export interface Condition {
  questionKey: string;
  operator: Operator;
  value: any;
}

export interface ConditionalRules {
  logic: "AND" | "OR";
  conditions: Condition[];
}

/**
 * PURE FUNCTION: Decides if a question should be visible.
 * Now supports Arrays (Multi-Select) and Case-Insensitive matching.
 */
export function shouldShowQuestion(
  rules: ConditionalRules | null,
  answers: Record<string, any>
): boolean {
  // 1. If no rules exist, the field is visible by default
  if (!rules || !rules.conditions || rules.conditions.length === 0) {
    return true;
  }

  // 2. Evaluate every condition
  const results = rules.conditions.map((condition) => {
    const rawUserAnswer = answers[condition.questionKey];
    const targetValue = condition.value;

    // If user hasn't answered the trigger question yet, condition fails
    if (
      rawUserAnswer === undefined ||
      rawUserAnswer === null ||
      rawUserAnswer === ""
    ) {
      return false;
    }

    // --- CASE 1: HANDLE MULTI-SELECT (ARRAY) ANSWERS ---
    if (Array.isArray(rawUserAnswer)) {
      // Example: User chose ["Engineer", "Manager"]. Rule is: Equals "Engineer"
      if (condition.operator === "equals") {
        return rawUserAnswer.includes(targetValue);
      }
      if (condition.operator === "notEquals") {
        return !rawUserAnswer.includes(targetValue);
      }
      if (condition.operator === "contains") {
        // If ANY of the selected options contains the target text
        return rawUserAnswer.some((item) =>
          String(item).toLowerCase().includes(String(targetValue).toLowerCase())
        );
      }
      return false;
    }

    // --- CASE 2: HANDLE SINGLE VALUES (String/Number/Boolean) ---
    // Normalize everything to lowercase strings for safe comparison
    const userStr = String(rawUserAnswer).toLowerCase();
    const targetStr = String(targetValue).toLowerCase();

    switch (condition.operator) {
      case "equals":
        return userStr === targetStr;
      case "notEquals":
        return userStr !== targetStr;
      case "contains":
        return userStr.includes(targetStr);
      default:
        return false;
    }
  });

  // 3. Combine results based on Logic Gate
  if (rules.logic === "OR") {
    // Returns TRUE if at least ONE condition is met
    return results.some((r) => r === true);
  } else {
    // Default (AND): Returns TRUE only if ALL conditions are met
    return results.every((r) => r === true);
  }
}
