import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useForm, Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Mail, Phone, User } from 'lucide-react-native';
import { forgotPasswordFormSchema, signInFormSchema, signUpFormSchema, type SignInForm, type SignUpForm } from '@servebell/shared';
import { Button, Input, Text, useTheme, type InputProps } from '@servebell/design-system';
import { authErrorMessage } from './firebase';
import { session } from './session';

function Field<T extends FieldValues>({ control, name, ...props }: { control: Control<T>; name: Path<T> } & InputProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Input {...props} value={field.value ?? ''} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />
      )}
    />
  );
}

function FormError({ message }: { message: string | null }) {
  const t = useTheme();
  if (!message) return null;
  return (
    <View style={{ padding: 12, borderRadius: t.radii.md, backgroundColor: t.colors.dangerSoft }} accessibilityRole="alert">
      <Text variant="callout" color="danger">{message}</Text>
    </View>
  );
}

export function SignInFormView({ onForgot, onSignUp }: { onForgot: () => void; onSignUp: () => void }) {
  const t = useTheme();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignInForm>({ resolver: zodResolver(signInFormSchema), defaultValues: { email: '', password: '' } });
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await session.signIn(v.email, v.password);
    } catch (e) {
      setError(authErrorMessage(e));
    }
  });
  const icon = (I: typeof Mail) => <I size={18} color={t.colors.textMuted} />;
  return (
    <View style={{ gap: 14 }}>
      <FormError message={error} />
      <Field control={control} name="email" label="Email" placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" leftIcon={icon(Mail)} />
      <Field control={control} name="password" label="Password" placeholder="Your password" secureToggle autoComplete="current-password" textContentType="password" leftIcon={icon(Lock)} onSubmitEditing={() => void submit()} />
      <Pressable onPress={onForgot} style={{ alignSelf: 'flex-end' }} hitSlop={8} accessibilityRole="link">
        <Text variant="captionStrong" color="primary">Forgot password?</Text>
      </Pressable>
      <Button title="Sign in" onPress={() => void submit()} loading={formState.isSubmitting} />
      <Pressable onPress={onSignUp} style={{ alignSelf: 'center', paddingVertical: 6 }} accessibilityRole="link">
        <Text variant="callout" color="textSecondary">New to ServeBell? <Text variant="bodyStrong" color="primary">Create an account</Text></Text>
      </Pressable>
    </View>
  );
}

export function SignUpFormView({ onSignIn }: { onSignIn: () => void }) {
  const t = useTheme();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignUpForm>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '', phone: '' },
  });
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await session.signUp({ fullName: v.fullName, email: v.email, password: v.password, phone: v.phone || undefined });
    } catch (e) {
      setError(authErrorMessage(e));
    }
  });
  const icon = (I: typeof Mail) => <I size={18} color={t.colors.textMuted} />;
  return (
    <View style={{ gap: 14 }}>
      <FormError message={error} />
      <Field control={control} name="fullName" label="Full name" placeholder="Sarah Johnson" autoComplete="name" textContentType="name" leftIcon={icon(User)} />
      <Field control={control} name="email" label="Email" placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" leftIcon={icon(Mail)} />
      <Field control={control} name="phone" label="Phone (optional)" placeholder="07X XXX XXXX" keyboardType="phone-pad" autoComplete="tel" leftIcon={icon(Phone)} />
      <Field control={control} name="password" label="Password" placeholder="At least 8 characters" secureToggle autoComplete="new-password" textContentType="newPassword" leftIcon={icon(Lock)} hint="Use 8+ characters with a letter and a number." />
      <Field control={control} name="confirmPassword" label="Confirm password" placeholder="Repeat password" secureToggle autoComplete="new-password" leftIcon={icon(Lock)} onSubmitEditing={() => void submit()} />
      <Button title="Create account" onPress={() => void submit()} loading={formState.isSubmitting} style={{ marginTop: 4 }} />
      <Pressable onPress={onSignIn} style={{ alignSelf: 'center', paddingVertical: 6 }} accessibilityRole="link">
        <Text variant="callout" color="textSecondary">Already have an account? <Text variant="bodyStrong" color="primary">Sign in</Text></Text>
      </Pressable>
    </View>
  );
}

export function ForgotPasswordFormView({ onDone }: { onDone: () => void }) {
  const t = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const { control, handleSubmit, formState } = useForm<{ email: string }>({ resolver: zodResolver(forgotPasswordFormSchema), defaultValues: { email: '' } });
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await session.sendPasswordReset(v.email);
      setSent(true);
    } catch (e) {
      // Don't reveal whether an account exists.
      if ((e as { code?: string }).code === 'auth/user-not-found') setSent(true);
      else setError(authErrorMessage(e));
    }
  });
  if (sent) {
    return (
      <View style={{ gap: 16 }}>
        <Text variant="body" color="textSecondary">If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.</Text>
        <Button title="Back to sign in" onPress={onDone} />
      </View>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      <FormError message={error} />
      <Field control={control} name="email" label="Email" placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" leftIcon={<Mail size={18} color={t.colors.textMuted} />} onSubmitEditing={() => void submit()} />
      <Button title="Send reset link" onPress={() => void submit()} loading={formState.isSubmitting} />
    </View>
  );
}
