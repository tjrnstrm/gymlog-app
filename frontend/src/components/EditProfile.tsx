import { uploadAvatar, updateProfile } from '../api/Profile';
import { useProfile } from '../hooks/useProfile';
import { useAuth } from '../hooks/useAuth';
import { useState } from 'react';
import { FaUser } from 'react-icons/fa';

export default function EditProfile({ onSaved }: { onSaved?: () => void }) {
  const { profile, setProfile } = useProfile();
  const { access, refresh } = useAuth();
  const [name, setName] = useState<string>('');
  const [age, setAge] = useState<number>(0);
  const [bio, setBio] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Fill the form when the profile loads or changes (adjusting state during render, not in an effect).
  const [syncedProfile, setSyncedProfile] = useState(profile);
  if (profile !== syncedProfile) {
    setSyncedProfile(profile);
    if (profile) {
      setName(profile.name ?? '');
      setAge(profile.age ?? 0);
      setBio(profile.bio ?? '');
      setTags((profile.coachTags ?? []).join(', '));
    }
  }

  const handleUpload = async (e: { preventDefault: () => void }) => {
    e.preventDefault();

    try {
      let avatarUrl = profile?.avatarUrl ?? null;
      if (file) {
        const result = await uploadAvatar(file);
        avatarUrl = result.url;
      }
      const coachFields = access.coach
        ? { bio, coachTags: tags.split(',').map((t) => t.trim()).filter(Boolean) }
        : {};
      const updated = await updateProfile({ name, age, avatarUrl, ...coachFields });
      setProfile(updated);
      await refresh();
      onSaved?.();
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error uploading file');
    }
  };

  return (
    <form
      className="create-profile-form"
      onSubmit={handleUpload}
      encType="multipart/form-data"
    >
      <div className="ProfileHeader">
        {preview || profile?.avatarUrl ? (
          <img src={preview ?? profile!.avatarUrl!} alt="Avatar" className="avatar" />
        ) : (
          <div className="avatar-placeholder">
            <FaUser />
          </div>
        )}
        <div className="avatar-actions">
          <label className="upload-btn" htmlFor="avatar-upload">Change</label>
          <input
            id="avatar-upload"
            type="file"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
          />
          <button
            type="button"
            className="remove-btn"
            onClick={async () => {
              const updated = await updateProfile({ avatarUrl: null });
              setProfile(updated);
              setPreview(null);
              setFile(null);
            }}
          >
            Remove
          </button>
        </div>
      </div>
      <label htmlFor="name">
        Name <small>(Optional)</small>
      </label>
      <input
        type="text"
        id="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
      />
      <label htmlFor="age">
        Age <small>(optional)</small>
      </label>
      <input
        type="number"
        id="age"
        value={age}
        onChange={(e) => setAge(Number(e.target.value))}
        placeholder="Age"
      />

      {access.coach && (
        <>
          <label htmlFor="bio">
            Coach bio <small>(shown in the coach directory)</small>
          </label>
          <textarea id="bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
          <label htmlFor="tags">
            Specialties <small>(comma separated, e.g. Strength, Bodybuilding)</small>
          </label>
          <input type="text" id="tags" value={tags} onChange={(e) => setTags(e.target.value)} />
        </>
      )}

      <button type="submit">Save</button>
    </form>
  );
}
