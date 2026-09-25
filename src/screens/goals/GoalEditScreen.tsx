import { useParams } from 'react-router-dom';
import { ScreenHeader } from '../../app/ScreenHeader';
import { useGoal } from '../../hooks/useGoal';
import type { GoalId } from '../../domain/types';
import { GoalEditForm } from './GoalEditForm';

export function GoalEditScreen() {
  const { goalId } = useParams<{ goalId: string }>();
  const { data: goal, loading } = useGoal((goalId ?? '') as GoalId);

  return (
    <>
      <ScreenHeader title="Edit goal" />
      {!loading && !goal && (
        <div style={{ padding: 16 }}>
          <p>This goal was deleted.</p>
        </div>
      )}
      {goal && <GoalEditForm key={goal.id} goal={goal} />}
    </>
  );
}
