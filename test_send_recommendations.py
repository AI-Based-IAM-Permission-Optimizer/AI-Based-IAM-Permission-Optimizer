#!/usr/bin/env python3
"""
test_send_recommendations.py
============================
Unit tests for send_recommendations.py CSV transformation, validation,
batch envelope creation, and dry-run CLI logic.

Runs offline without making HTTP requests.
"""

import json
import unittest
from unittest.mock import MagicMock, patch

from send_recommendations import (
    PRODUCTION_FIELDS,
    create_batch_envelope,
    load_and_transform_csv,
    parse_reason_codes,
    send_batch,
    transform_row,
    validate_recommendations,
)


class TestSendRecommendations(unittest.TestCase):
    def setUp(self):
        self.valid_csv_row = {
            "recommendation_id": "REC-TEST-001",
            "user_id": "synthetic-user-001",
            "role_id": "BackendDeveloper-Role",
            "action": "s3:GetObject",
            "resource": "arn:aws:s3:::my-bucket/*",
            "risk_score": "0.15",
            "risk_weight": "3",
            "risk_level": "LOW",
            "prediction": "INTENDED",
            "recommendation": "KEEP",
            "reason_codes": '["LOW_RISK_READ_ACTION", "DAILY_ACCESS"]',
            "explanation": "Permission appears justified.",
            "model_version": "iam_risk_v2_model",
            "generated_at": "2026-09-25T11:37:25Z",
        }

    def test_valid_csv_row_converts_correctly(self):
        item = transform_row(self.valid_csv_row)
        self.assertEqual(item["recommendation_id"], "REC-TEST-001")
        self.assertEqual(item["user_id"], "synthetic-user-001")
        self.assertEqual(item["role_id"], "BackendDeveloper-Role")
        self.assertEqual(item["action"], "s3:GetObject")
        self.assertEqual(item["resource"], "arn:aws:s3:::my-bucket/*")
        self.assertEqual(item["risk_score"], 0.15)
        self.assertEqual(item["risk_weight"], 3)
        self.assertEqual(item["risk_level"], "LOW")
        self.assertEqual(item["prediction"], "INTENDED")
        self.assertEqual(item["recommendation"], "KEEP")
        self.assertEqual(item["reason_codes"], ["LOW_RISK_READ_ACTION", "DAILY_ACCESS"])
        self.assertEqual(item["explanation"], "Permission appears justified.")
        self.assertEqual(item["model_version"], "iam_risk_v2_model")
        self.assertEqual(item["generated_at"], "2026-09-25T11:37:25Z")

    def test_reason_codes_converts_from_csv_representation_to_json_array(self):
        parsed1 = parse_reason_codes('["LOW_USAGE", "HIGH_RISK_ACTION"]')
        self.assertEqual(parsed1, ["LOW_USAGE", "HIGH_RISK_ACTION"])

        parsed2 = parse_reason_codes("['SINGLE_REASON']")
        self.assertEqual(parsed2, ["SINGLE_REASON"])

        parsed3 = parse_reason_codes("INACTIVE_90D")
        self.assertEqual(parsed3, ["INACTIVE_90D"])

        parsed4 = parse_reason_codes("")
        self.assertEqual(parsed4, [])

    def test_numeric_risk_score_and_risk_weight_remain_numeric(self):
        item = transform_row(self.valid_csv_row)
        self.assertIsInstance(item["risk_score"], float)
        self.assertIsInstance(item["risk_weight"], int)
        self.assertNotIsInstance(item["risk_weight"], str)
        self.assertNotIsInstance(item["risk_score"], str)

    def test_invalid_role_id_is_rejected(self):
        invalid_row = {**self.valid_csv_row, "role_id": "ApplicationDeveloper-Role"}
        item = transform_row(invalid_row)
        with self.assertRaises(ValueError) as ctx:
            validate_recommendations([item])
        self.assertIn("invalid role_id", str(ctx.exception))

    def test_invalid_prediction_is_rejected(self):
        invalid_row = {**self.valid_csv_row, "prediction": "NORMAL"}
        item = transform_row(invalid_row)
        with self.assertRaises(ValueError) as ctx:
            validate_recommendations([item])
        self.assertIn("invalid prediction", str(ctx.exception))

    def test_invalid_recommendation_is_rejected(self):
        invalid_row = {**self.valid_csv_row, "recommendation": "DISCARD"}
        item = transform_row(invalid_row)
        with self.assertRaises(ValueError) as ctx:
            validate_recommendations([item])
        self.assertIn("invalid recommendation", str(ctx.exception))

    def test_missing_required_field_is_rejected(self):
        invalid_row = {**self.valid_csv_row, "user_id": ""}
        item = transform_row(invalid_row)
        with self.assertRaises(ValueError) as ctx:
            validate_recommendations([item])
        self.assertIn("missing required field 'user_id'", str(ctx.exception))

    def test_duplicate_recommendation_id_is_rejected(self):
        item1 = transform_row(self.valid_csv_row)
        item2 = transform_row(self.valid_csv_row)
        with self.assertRaises(ValueError) as ctx:
            validate_recommendations([item1, item2])
        self.assertIn("Duplicate recommendation_id", str(ctx.exception))

    def test_exactly_14_output_fields_are_produced(self):
        item = transform_row(self.valid_csv_row)
        self.assertEqual(len(item.keys()), 14)
        self.assertEqual(set(item.keys()), set(PRODUCTION_FIELDS))
        self.assertNotIn("confidence", item)

    def test_dry_run_does_not_make_http_requests(self):
        with patch("send_recommendations.requests.post") as mock_post:
            from send_recommendations import main

            test_args = ["send_recommendations.py", "--limit", "2", "--dry-run"]
            with patch("sys.argv", test_args):
                main()

            mock_post.assert_not_called()

    def test_create_batch_envelope_structure(self):
        item = transform_row(self.valid_csv_row)
        envelope = create_batch_envelope([item])
        self.assertEqual(envelope["model_version"], "iam_risk_v2_model")
        self.assertEqual(envelope["generated_at"], "2026-09-25T11:37:25Z")
        self.assertEqual(len(envelope["recommendations"]), 1)
        self.assertEqual(envelope["recommendations"][0]["recommendation_id"], "REC-TEST-001")

    @patch("send_recommendations.os.path.exists", return_value=True)
    @patch("send_recommendations.open", new_callable=unittest.mock.mock_open)
    @patch("send_recommendations.csv.DictReader")
    def test_start_and_limit_slicing(self, mock_reader, mock_file, mock_exists):
        def make_row(idx):
            row = self.valid_csv_row.copy()
            row["recommendation_id"] = f"REC-TEST-{idx}"
            return row

        # Mock CSV having 5 rows
        mock_reader.return_value = [make_row(0), make_row(1), make_row(2), make_row(3), make_row(4)]

        # test default start=0, limit=2
        items = load_and_transform_csv("dummy.csv", start=0, limit=2)
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["recommendation_id"], "REC-TEST-0")
        self.assertEqual(items[1]["recommendation_id"], "REC-TEST-1")

        # test start=2, limit=2
        items = load_and_transform_csv("dummy.csv", start=2, limit=2)
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["recommendation_id"], "REC-TEST-2")
        self.assertEqual(items[1]["recommendation_id"], "REC-TEST-3")

        # test start beyond EOF
        with self.assertRaises(ValueError) as ctx:
            load_and_transform_csv("dummy.csv", start=100, limit=2)
        self.assertIn("recommendation list is empty", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
