import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { FilePurpose } from '@servebell/shared';
import { api } from './session';
export { mediaUrl } from './config';

/**
 * Lets the user pick a photo and uploads it (resized server-side to WebP).
 * Returns null if cancelled. Permission prompts are handled by the system picker.
 */
export async function pickAndUploadImage(purpose: FilePurpose, restaurantId?: string, aspect: [number, number] = purpose === 'AVATAR' ? [1, 1] : [4, 3], source: 'library' | 'camera' = 'library') {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Allow camera access in Settings to take a photo of your room.');
      return null;
    }
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: source === 'library', aspect, quality: 0.85 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const type = asset.mimeType ?? 'image/jpeg';
  try {
    return await api.uploads.image({ uri: asset.uri, name: asset.fileName ?? `photo.${type.split('/')[1] ?? 'jpg'}`, type }, purpose, restaurantId);
  } catch (e) {
    Alert.alert('Upload failed', e instanceof Error ? e.message : 'Please try again.');
    return null;
  }
}
