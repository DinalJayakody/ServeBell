import { useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { InfoLabel } from './InfoTip';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  /** Short guide shown from an ⓘ next to the label. */
  info?: string;
  leftIcon?: ReactNode;
  secureToggle?: boolean;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}

export function Input({ label, error, hint, info, leftIcon, secureToggle, secureTextEntry, style, onFocus, onBlur, ref, ...rest }: InputProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const borderColor = error ? t.colors.danger : focused ? t.colors.primary : t.colors.border;

  return (
    <View style={{ gap: 6 }}>
      {label ? <InfoLabel label={label} info={info} /> : null}
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, paddingHorizontal: 14, borderRadius: t.radii.md, borderWidth: 1, borderColor, backgroundColor: t.colors.surfaceMuted }}
      >
        {leftIcon}
        <TextInput
          ref={ref}
          placeholderTextColor={t.colors.textMuted}
          selectionColor={t.colors.primary}
          secureTextEntry={secureToggle ? hidden : secureTextEntry}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          accessibilityLabel={label}
          {...rest}
          style={[t.typography.body, { flex: 1, color: t.colors.text, paddingVertical: 0 }, style]}
        />
        {secureToggle ? (
          <Pressable onPress={() => setHidden((h) => !h)} accessibilityLabel={hidden ? 'Show password' : 'Hide password'} hitSlop={10}>
            {hidden ? <Eye size={18} color={t.colors.textMuted} /> : <EyeOff size={18} color={t.colors.textMuted} />}
          </Pressable>
        ) : null}
      </View>
      {error ? <Text variant="caption" color="danger">{error}</Text> : hint ? <Text variant="caption" color="textMuted">{hint}</Text> : null}
    </View>
  );
}
