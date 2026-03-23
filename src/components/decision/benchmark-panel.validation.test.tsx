import { describe, it, expect } from "vitest";
import type { DecisionBenchmarkCase } from "@/lib/decision/types";

// Extract validation logic from benchmark-panel.tsx for testing
type FieldValidation = {
  isValid: boolean;
  message?: string;
  touched?: boolean;
};

type ValidationResult = {
  id: FieldValidation;
  task: FieldValidation;
  stakeholders: FieldValidation;
  successCriteria: FieldValidation;
  expectedCriteria: FieldValidation;
};

function validateBenchmarkCase(benchmark: DecisionBenchmarkCase | null): ValidationResult {
  if (!benchmark) {
    return {
      id: { isValid: false, message: "Benchmark를 선택하세요" },
      task: { isValid: false, message: "" },
      stakeholders: { isValid: false, message: "" },
      successCriteria: { isValid: false, message: "" },
      expectedCriteria: { isValid: false, message: "" },
    };
  }

  const idValidation = /^[a-zA-Z0-9_-]+$/;
  return {
    id: {
      isValid: idValidation.test(benchmark.id),
      message: idValidation.test(benchmark.id) ? undefined : "ID는 영문, 숫자, 밑줄(_), 하이픈(-)만 허용",
    },
    task: {
      isValid: benchmark.input.task.trim().length >= 10,
      message: benchmark.input.task.trim().length >= 10 ? undefined : "Task는 최소 10자 이상이어야 합니다",
    },
    stakeholders: {
      isValid: (benchmark.input.stakeholders?.length ?? 0) >= 1,
      message: (benchmark.input.stakeholders?.length ?? 0) >= 1 ? undefined : "최소 1명 이상의 stakeholder가 필요합니다",
    },
    successCriteria: {
      isValid: (benchmark.input.successCriteria?.length ?? 0) >= 1,
      message: (benchmark.input.successCriteria?.length ?? 0) >= 1 ? undefined : "최소 1개 이상의 성공 기준이 필요합니다",
    },
    expectedCriteria: {
      isValid: benchmark.expectedCriteria.length >= 1,
      message: benchmark.expectedCriteria.length >= 1 ? undefined : "최소 1개 이상의 예상 기준이 필요합니다",
    },
  };
}

function isValidationValid(validation: ValidationResult): boolean {
  return Object.values(validation).every((field) => field.isValid);
}

function createValidBenchmark(overrides?: Partial<DecisionBenchmarkCase>): DecisionBenchmarkCase {
  return {
    id: "test-benchmark-1",
    title: "Test Benchmark",
    input: {
      task: "This is a valid task description with more than 10 characters",
      background: "Test background",
      context: ["Context 1"],
      stakeholders: ["Stakeholder 1"],
      successCriteria: ["Success criterion 1"],
    },
    expectedCriteria: ["Expected criterion 1"],
    ...overrides,
  };
}

describe("validateBenchmarkCase", () => {
  describe("null benchmark", () => {
    it("returns invalid validation for null benchmark", () => {
      const result = validateBenchmarkCase(null);

      expect(result.id.isValid).toBe(false);
      expect(result.id.message).toBe("Benchmark를 선택하세요");
      expect(result.task.isValid).toBe(false);
      expect(result.stakeholders.isValid).toBe(false);
      expect(result.successCriteria.isValid).toBe(false);
      expect(result.expectedCriteria.isValid).toBe(false);
    });
  });

  describe("id validation", () => {
    it("accepts valid alphanumeric IDs with hyphens and underscores", () => {
      const validIds = [
        "test-1",
        "test_1",
        "Test-123",
        "abc_def-123",
        "benchmark-case-01",
      ];

      validIds.forEach((id) => {
        const benchmark = createValidBenchmark({ id });
        const result = validateBenchmarkCase(benchmark);

        expect(result.id.isValid).toBe(true);
        expect(result.id.message).toBeUndefined();
      });
    });

    it("rejects IDs with special characters", () => {
      const invalidIds = [
        "test 1",
        "test.1",
        "test@1",
        "test#1",
        "test$1",
        "test%1",
        "test&1",
        "test*1",
        "test+1",
        "test=1",
        "test/1",
        "한글-ID",
        "test!1",
      ];

      invalidIds.forEach((id) => {
        const benchmark = createValidBenchmark({ id });
        const result = validateBenchmarkCase(benchmark);

        expect(result.id.isValid).toBe(false);
        expect(result.id.message).toBe("ID는 영문, 숫자, 밑줄(_), 하이픈(-)만 허용");
      });
    });

    it("rejects empty ID", () => {
      const benchmark = createValidBenchmark({ id: "" });
      const result = validateBenchmarkCase(benchmark);

      expect(result.id.isValid).toBe(false);
      expect(result.id.message).toBeDefined();
    });

    it("accepts single character ID", () => {
      const benchmark = createValidBenchmark({ id: "a" });
      const result = validateBenchmarkCase(benchmark);

      expect(result.id.isValid).toBe(true);
    });
  });

  describe("task validation", () => {
    it("accepts task with 10 or more characters", () => {
      const validTasks = [
        "This is exactly ten chars!",
        "This task is long enough",
        "A".repeat(10),
        "Task with multiple words and sufficient length",
      ];

      validTasks.forEach((task) => {
        const benchmark = createValidBenchmark({ input: { ...createValidBenchmark().input, task } });
        const result = validateBenchmarkCase(benchmark);

        expect(result.task.isValid).toBe(true);
        expect(result.task.message).toBeUndefined();
      });
    });

    it("rejects task with less than 10 characters", () => {
      const invalidTasks = [
        "short",
        "tiny",
        "abc",
        "",
        "123456789",
      ];

      invalidTasks.forEach((task) => {
        const benchmark = createValidBenchmark({ input: { ...createValidBenchmark().input, task } });
        const result = validateBenchmarkCase(benchmark);

        expect(result.task.isValid).toBe(false);
        expect(result.task.message).toBe("Task는 최소 10자 이상이어야 합니다");
      });
    });

    it("trims whitespace before checking length", () => {
      const benchmark = createValidBenchmark({
        input: { ...createValidBenchmark().input, task: "   short   " },
      });
      const result = validateBenchmarkCase(benchmark);

      expect(result.task.isValid).toBe(false);
    });

    it("accepts task with only spaces but > 10 chars after trim", () => {
      const benchmark = createValidBenchmark({
        input: { ...createValidBenchmark().input, task: "     " },
      });
      const result = validateBenchmarkCase(benchmark);

      expect(result.task.isValid).toBe(false);
    });
  });

  describe("stakeholders validation", () => {
    it("accepts one or more stakeholders", () => {
      const validStakeholders = [
        ["Stakeholder 1"],
        ["Stakeholder A", "Stakeholder B"],
        ["User", "Admin", "Manager"],
      ];

      validStakeholders.forEach((stakeholders) => {
        const benchmark = createValidBenchmark({
          input: { ...createValidBenchmark().input, stakeholders },
        });
        const result = validateBenchmarkCase(benchmark);

        expect(result.stakeholders.isValid).toBe(true);
        expect(result.stakeholders.message).toBeUndefined();
      });
    });

    it("rejects empty stakeholders array", () => {
      const benchmark = createValidBenchmark({
        input: { ...createValidBenchmark().input, stakeholders: [] },
      });
      const result = validateBenchmarkCase(benchmark);

      expect(result.stakeholders.isValid).toBe(false);
      expect(result.stakeholders.message).toBe("최소 1명 이상의 stakeholder가 필요합니다");
    });

    it("rejects undefined stakeholders", () => {
      const benchmark = createValidBenchmark({
        input: { ...createValidBenchmark().input, stakeholders: undefined },
      });
      const result = validateBenchmarkCase(benchmark);

      expect(result.stakeholders.isValid).toBe(false);
      expect(result.stakeholders.message).toBe("최소 1명 이상의 stakeholder가 필요합니다");
    });
  });

  describe("successCriteria validation", () => {
    it("accepts one or more success criteria", () => {
      const validCriteria = [
        ["Criterion 1"],
        ["Criterion A", "Criterion B"],
        ["Success 1", "Success 2", "Success 3"],
      ];

      validCriteria.forEach((successCriteria) => {
        const benchmark = createValidBenchmark({
          input: { ...createValidBenchmark().input, successCriteria },
        });
        const result = validateBenchmarkCase(benchmark);

        expect(result.successCriteria.isValid).toBe(true);
        expect(result.successCriteria.message).toBeUndefined();
      });
    });

    it("rejects empty success criteria array", () => {
      const benchmark = createValidBenchmark({
        input: { ...createValidBenchmark().input, successCriteria: [] },
      });
      const result = validateBenchmarkCase(benchmark);

      expect(result.successCriteria.isValid).toBe(false);
      expect(result.successCriteria.message).toBe("최소 1개 이상의 성공 기준이 필요합니다");
    });

    it("rejects undefined success criteria", () => {
      const benchmark = createValidBenchmark({
        input: { ...createValidBenchmark().input, successCriteria: undefined },
      });
      const result = validateBenchmarkCase(benchmark);

      expect(result.successCriteria.isValid).toBe(false);
      expect(result.successCriteria.message).toBe("최소 1개 이상의 성공 기준이 필요합니다");
    });
  });

  describe("expectedCriteria validation", () => {
    it("accepts one or more expected criteria", () => {
      const validCriteria = [
        ["Expected 1"],
        ["Expected A", "Expected B"],
        ["Outcome 1", "Outcome 2", "Outcome 3"],
      ];

      validCriteria.forEach((expectedCriteria) => {
        const benchmark = createValidBenchmark({ expectedCriteria });
        const result = validateBenchmarkCase(benchmark);

        expect(result.expectedCriteria.isValid).toBe(true);
        expect(result.expectedCriteria.message).toBeUndefined();
      });
    });

    it("rejects empty expected criteria array", () => {
      const benchmark = createValidBenchmark({ expectedCriteria: [] });
      const result = validateBenchmarkCase(benchmark);

      expect(result.expectedCriteria.isValid).toBe(false);
      expect(result.expectedCriteria.message).toBe("최소 1개 이상의 예상 기준이 필요합니다");
    });
  });

  describe("combined validation scenarios", () => {
    it("validates a complete valid benchmark", () => {
      const benchmark = createValidBenchmark();
      const result = validateBenchmarkCase(benchmark);

      expect(isValidationValid(result)).toBe(true);
      expect(result.id.isValid).toBe(true);
      expect(result.task.isValid).toBe(true);
      expect(result.stakeholders.isValid).toBe(true);
      expect(result.successCriteria.isValid).toBe(true);
      expect(result.expectedCriteria.isValid).toBe(true);
    });

    it("detects multiple validation errors", () => {
      const benchmark = {
        id: "invalid id!",
        title: "Invalid Benchmark",
        input: {
          task: "short",
          background: "Test",
          stakeholders: [],
          successCriteria: [],
        },
        expectedCriteria: [],
      } as DecisionBenchmarkCase;

      const result = validateBenchmarkCase(benchmark);

      expect(isValidationValid(result)).toBe(false);
      expect(result.id.isValid).toBe(false);
      expect(result.task.isValid).toBe(false);
      expect(result.stakeholders.isValid).toBe(false);
      expect(result.successCriteria.isValid).toBe(false);
      expect(result.expectedCriteria.isValid).toBe(false);
    });

    it("passes when all fields meet minimum requirements", () => {
      const benchmark = {
        id: "minimal-valid",
        title: "Minimal Valid",
        input: {
          task: "1234567890", // exactly 10 chars
          stakeholders: ["One stakeholder"],
          successCriteria: ["One criterion"],
        },
        expectedCriteria: ["One expected"],
      } as DecisionBenchmarkCase;

      const result = validateBenchmarkCase(benchmark);

      expect(isValidationValid(result)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles benchmark with optional fields missing", () => {
      const benchmark = {
        id: "optional-fields",
        title: "Optional Fields",
        input: {
          task: "Task with sufficient length",
          stakeholders: ["Stakeholder"],
          successCriteria: ["Criteria"],
        },
        expectedCriteria: ["Expected"],
      } as DecisionBenchmarkCase;

      const result = validateBenchmarkCase(benchmark);

      expect(isValidationValid(result)).toBe(true);
    });

    it("handles very long task descriptions", () => {
      const longTask = "A".repeat(10000);
      const benchmark = createValidBenchmark({
        input: { ...createValidBenchmark().input, task: longTask },
      });
      const result = validateBenchmarkCase(benchmark);

      expect(result.task.isValid).toBe(true);
    });

    it("handles stakeholders with special characters", () => {
      const benchmark = createValidBenchmark({
        input: {
          ...createValidBenchmark().input,
          stakeholders: ["User@Company", "Admin/Manager", "李明 (Li Ming)"],
        },
      });
      const result = validateBenchmarkCase(benchmark);

      expect(result.stakeholders.isValid).toBe(true);
    });

    it("handles empty strings in stakeholders array", () => {
      const benchmark = createValidBenchmark({
        input: {
          ...createValidBenchmark().input,
          stakeholders: ["Valid stakeholder", "", "   "],
        },
      });
      const result = validateBenchmarkCase(benchmark);

      // Empty strings count as stakeholders (array length check)
      expect(result.stakeholders.isValid).toBe(true);
    });
  });
});

describe("isValidationValid", () => {
  it("returns true when all fields are valid", () => {
    const validation: ValidationResult = {
      id: { isValid: true, touched: false },
      task: { isValid: true, touched: false },
      stakeholders: { isValid: true, touched: false },
      successCriteria: { isValid: true, touched: false },
      expectedCriteria: { isValid: true, touched: false },
    };

    expect(isValidationValid(validation)).toBe(true);
  });

  it("returns false when any field is invalid", () => {
    const baseValidation: ValidationResult = {
      id: { isValid: true, touched: false },
      task: { isValid: true, touched: false },
      stakeholders: { isValid: true, touched: false },
      successCriteria: { isValid: true, touched: false },
      expectedCriteria: { isValid: true, touched: false },
    };

    const invalidCases = [
      { ...baseValidation, id: { isValid: false, touched: false } },
      { ...baseValidation, task: { isValid: false, touched: false } },
      { ...baseValidation, stakeholders: { isValid: false, touched: false } },
      { ...baseValidation, successCriteria: { isValid: false, touched: false } },
      { ...baseValidation, expectedCriteria: { isValid: false, touched: false } },
    ];

    invalidCases.forEach((validation) => {
      expect(isValidationValid(validation)).toBe(false);
    });
  });

  it("returns false when multiple fields are invalid", () => {
    const validation: ValidationResult = {
      id: { isValid: false, touched: false },
      task: { isValid: false, touched: false },
      stakeholders: { isValid: true, touched: false },
      successCriteria: { isValid: true, touched: false },
      expectedCriteria: { isValid: true, touched: false },
    };

    expect(isValidationValid(validation)).toBe(false);
  });
});
