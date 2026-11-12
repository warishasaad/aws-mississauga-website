import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as budgets from 'aws-cdk-lib/aws-budgets';

export interface BudgetStackProps extends StackProps {
  alertEmail: string;
  monthlyBudgetUsd: number;
}

/** Emails the organizers when spending reaches 80% of the monthly budget, or is forecast to pass it. */
export class BudgetStack extends Stack {
  constructor(scope: Construct, id: string, props: BudgetStackProps) {
    super(scope, id, props);

    if (!Number.isFinite(props.monthlyBudgetUsd) || props.monthlyBudgetUsd <= 0) {
      throw new Error('monthlyBudgetUsd in cdk.json must be a positive number, e.g. "20".');
    }

    const subscribers = [{ subscriptionType: 'EMAIL', address: props.alertEmail }];

    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'aws-mississauga-monthly',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: props.monthlyBudgetUsd, unit: 'USD' },
      },
      notificationsWithSubscribers: [
        {
          notification: { notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold: 80, thresholdType: 'PERCENTAGE' },
          subscribers,
        },
        {
          notification: { notificationType: 'FORECASTED', comparisonOperator: 'GREATER_THAN', threshold: 100, thresholdType: 'PERCENTAGE' },
          subscribers,
        },
      ],
    });
  }
}
