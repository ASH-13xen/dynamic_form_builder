/* eslint-disable @typescript-eslint/no-explicit-any */
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
export function shouldShowQuestion(
  rules: ConditionalRules | null,
  answers: Record<string, any>
): boolean {
  if (!rules || !rules.conditions || rules.conditions.length === 0) {
    return true;
  }

  const results = rules.conditions.map((condition) => {
    const rawUserAnswer = answers[condition.questionKey];
    const targetValue = condition.value;
    if (
      rawUserAnswer === undefined ||
      rawUserAnswer === null ||
      rawUserAnswer === ""
    ) {
      return false;
    }
    if (Array.isArray(rawUserAnswer)) {
      if (condition.operator === "equals") {
        return rawUserAnswer.includes(targetValue);
      }
      if (condition.operator === "notEquals") {
        return !rawUserAnswer.includes(targetValue);
      }
      if (condition.operator === "contains") {
        return rawUserAnswer.some((item) =>
          String(item).toLowerCase().includes(String(targetValue).toLowerCase())
        );
      }
      return false;
    }
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

  if (rules.logic === "OR") {
    return results.some((r) => r === true);
  } else {
    return results.every((r) => r === true);
  }
}
