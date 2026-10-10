import unittest
from pipeline_common import preparation_factor


class PreparationBounds(unittest.TestCase):
    def test_all_supported_source_rates_reach_the_minimum(self):
        for fps in [6, 23.976, 24, 30, 60, 72, 90, 91, 95.9, 96]:
            with self.subTest(fps=fps):
                factor = preparation_factor(fps, 10)
                self.assertGreaterEqual(fps * factor, 96)
                self.assertGreaterEqual(factor, 4)
                self.assertLessEqual(factor, 16)

    def test_unsupported_or_nonfinite_inputs_fail_before_gpu_work(self):
        for fps, duration in [(5.9, 1), (96.1, 1), (float('nan'), 1), (float('inf'), 1),
                              (24, 0), (24, 121), (24, float('nan')), (24, float('inf'))]:
            with self.subTest(fps=fps, duration=duration):
                with self.assertRaises(RuntimeError):
                    preparation_factor(fps, duration)


if __name__ == '__main__':
    unittest.main()
