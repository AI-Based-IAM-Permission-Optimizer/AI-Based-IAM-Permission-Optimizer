import pandas as pd

features = pd.read_csv("data/processed/features.csv")

risk = pd.read_csv(
    "data/AWS_Risk_Weight_Table_FINAL_4007_Actions_Shuffled.csv"
)

final = features.merge(
    risk[["action", "operation_type", "risk_level", "risk_weight"]],
    on="action",
    how="left"
)

final.to_csv("data/processed/ml_ready.csv", index=False)

print("Final dataset created!")
print("Rows:", len(final))
print("Columns:", len(final.columns))
print(final.to_string(index=False))