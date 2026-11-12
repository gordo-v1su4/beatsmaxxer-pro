import { expect, it } from 'vitest';
import { parsePipelineMessage } from '../../../../media-worker/progress';

it('keeps decoder diagnostics from aborting GPU processing before its artifact arrives', () => {
  const lines = ['{"stage":"gpu-decoding"}', 'Decode Error occurred for picture 42', '', '{"stage":"gpu-verifying"}', '{"artifact":{"fps":96}}'];
  const messages = lines.map(parsePipelineMessage).filter(Boolean);
  expect(messages).toEqual([{stage:'gpu-decoding'}, {stage:'gpu-verifying'}, {artifact:{fps:96}}]);
});
