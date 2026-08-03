import { evaluateDesktopNativeProof } from '../src/lib/qa/desktopNativeProofContract';

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('usage: bun scripts/evaluate-desktop-native-proof.ts <report.json>');
  process.exit(2);
}

const file = Bun.file(reportPath);
if (!(await file.exists())) {
  console.error(`desktop native proof report is missing: ${reportPath}`);
  process.exit(1);
}

let report: unknown;
try {
  report = await file.json();
} catch (error) {
  console.error(`desktop native proof report is not valid JSON: ${String(error)}`);
  process.exit(1);
}

const result = evaluateDesktopNativeProof(report);
if (!result.passed) {
  console.error('desktop native proof: FAIL');
  for (const blocker of result.blockers) console.error(`- ${blocker}`);
  process.exit(1);
}

console.log('desktop native proof: PASS');
