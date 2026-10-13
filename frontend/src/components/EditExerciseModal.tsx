import { useState } from 'react';
import { updateExercise, deleteExercise } from '../api/Exercises';
import { useAuth } from '../hooks/useAuth';
import { canEditExercise } from '../types/Exercise';
import type { IExercise } from '../types/Exercise';

const MUSCLE_GROUPS = [
  'Quads', 'Hamstrings', 'Glutes', 'Chest', 'Lats',
  'Lower back', 'Shoulders', 'Biceps', 'Triceps', 'Core', 'Calves', 'Traps',
];

const CATEGORIES = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Duration'];

const BRANDS = [
  'HOIST', 'Hammer Strength', 'Arsenal', 'Life Fitness', 'Precor', 'Cybex', 'gymleco', 'gym80', 'Generic',
];

interface Props {
  exercise: IExercise;
  onClose: () => void;
  onUpdated: (exercise: IExercise) => void;
  onDeleted: (id: string) => void;
  exercises?: IExercise[];
}

function toggle(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function EditExerciseModal({ exercise, onClose, onUpdated, onDeleted, exercises = [] }: Props) {
  const { user } = useAuth();
  const canEdit = canEditExercise(exercise, user?.id);
  const [name, setName] = useState(exercise.name);
  const [muscleGroups, setMuscleGroups] = useState<string[]>(exercise.muscleGroups ?? []);
  const [category, setCategory] = useState(exercise.category?.[0] ?? '');
  const knownBrand = exercise.brand && BRANDS.includes(exercise.brand) ? exercise.brand : '';
  const [brandSelect, setBrandSelect] = useState(
    exercise.brand ? (knownBrand || 'Other') : '',
  );
  const [customBrand, setCustomBrand] = useState(knownBrand ? '' : exercise.brand ?? '');
  const [baseExercise, setBaseExercise] = useState(exercise.baseExercise ?? '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const brand = brandSelect === 'Other' ? customBrand.trim() : brandSelect;
    const updated = await updateExercise(exercise._id, {
      name,
      muscleGroups,
      category: category ? [category] : [],
      brand: brand || undefined,
      baseExercise: baseExercise || null,
    });
    onUpdated(updated);
    onClose();
  }

  async function handleDelete() {
    await deleteExercise(exercise._id);
    onDeleted(exercise._id);
    onClose();
  }

  if (!canEdit) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal__header">
            <h5>{exercise.name}</h5>
            <button type="button" className="modal__close" onClick={onClose}>✕</button>
          </div>
          <p className="muted">
            {exercise.isGlobal ? 'This is part of the shared catalogue, so only an admin can change it.' : "This isn't your exercise."}
          </p>
          {exercise.muscleGroups.length > 0 && <p>Muscle groups: {exercise.muscleGroups.join(', ')}</p>}
          {exercise.category.length > 0 && <p>Category: {exercise.category.join(', ')}</p>}
          {exercise.brand && <p>Brand: {exercise.brand}</p>}
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h5>Edit Exercise</h5>
          <button type="button" className="modal__close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <label>
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label>Muscle groups</label>
          <div className="tag-group">
            {MUSCLE_GROUPS.map((mg) => (
              <button
                key={mg}
                type="button"
                className={`tag${muscleGroups.includes(mg) ? ' tag--active' : ''}`}
                onClick={() => setMuscleGroups(toggle(muscleGroups, mg))}
              >
                {mg}
              </button>
            ))}
          </div>
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Select category</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </label>
          <label>
            Brand
            <select value={brandSelect} onChange={(e) => setBrandSelect(e.target.value)}>
              <option value="">Select brand</option>
              {BRANDS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
              <option value="Other">Other…</option>
            </select>
          </label>
          {brandSelect === 'Other' && (
            <label>
              Custom brand
              <input
                type="text"
                value={customBrand}
                onChange={(e) => setCustomBrand(e.target.value)}
              />
            </label>
          )}
          <label>
            Based on
            <select value={baseExercise ?? ''} onChange={(e) => setBaseExercise(e.target.value)}>
              <option value="">None</option>
              {exercises
                .filter((ex) => ex._id !== exercise._id)
                .map((ex) => (
                  <option key={ex._id} value={ex._id}>{ex.name}</option>
                ))}
            </select>
          </label>
          <div className="btn-group">
            <button type="submit" className="btn-success">Save</button>
            <button type="button" onClick={handleDelete} className="btn-danger">Delete</button>
          </div>
          <button type="button" onClick={onClose}>Cancel</button>
        </form>
      </div>
    </div>
  );
}
