import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useForm, Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Mail, MailCheck, Phone, User } from 'lucide-react-native';
import { forgotPasswordFormSchema, newPasswordFormSchema, signInFormSchema, signUpFormSchema, type NewPasswordForm, type SignInForm, type SignUpForm } from '@servebell/shared';
import { Button, IconBadge, Input, Text, useTheme, type InputProps } from '@servebell/design-system';
import { authErrorMessage } from './supabase';
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

/** Confirmation-pending panel shared by sign-up and sign-in. */
function CheckEmail({ email, onBack }: { email: string; onBack: () => void }) {
  const t = useTheme();
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | string>('idle');
  const resend = async () => {
    setState('sending');
    try {
      await session.resendVerification(email);
      setState('sent');
    } catch (e) {
      setState(authErrorMessage(e));
    }
  };
  return (
    <View style={{ gap: 16, alignItems: 'center' }}>
      <IconBadge tone="primary" size={56}><MailCheck size={26} color={t.colors.primary} /></IconBadge>
      <Text variant="title3" align="center">Check your email</Text>
      <Text variant="body" color="textSecondary" align="center">
        We sent a confirmation link to <Text variant="bodyStrong">{email}</Text>. Open it on this phone to finish creating your account, then sign in.
      </Text>
      <Text variant="caption" color="textMuted" align="center">Can’t find it? Check your spam folder.</Text>
      {state !== 'idle' && state !== 'sending' ? (
        <Text variant="caption" color={state === 'sent' ? 'success' : 'danger'} align="center">{state === 'sent' ? 'A new link is on its way.' : state}</Text>
      ) : null}
      <Button title="Resend email" variant="outline" onPress={() => void resend()} loading={state === 'sending'} style={{ alignSelf: 'stretch' }} />
      <Button title="Back to sign in" onPress={onBack} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

export function SignInFormView({ onForgot, onSignUp }: { onForgot: () => void; onSignUp: () => void }) {
  const t = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignInForm>({ resolver: zodResolver(signInFormSchema), defaultValues: { email: '', password: '' } });
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await session.signIn(v.email, v.password);
    } catch (e) {
      if ((e as { code?: string }).code === 'email_not_confirmed') setUnconfirmed(v.email);
      else setError(authErrorMessage(e));
    }
  });
  if (unconfirmed) return <CheckEmail email={unconfirmed} onBack={() => setUnconfirmed(null)} />;
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
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignUpForm>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '', phone: '' },
  });
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      const result = await session.signUp({ fullName: v.fullName, email: v.email, password: v.password, phone: v.phone || undefined });
      if (result === 'confirmEmail') setConfirmEmail(v.email);
    } catch (e) {
      setError(authErrorMessage(e));
    }
  });
  const icon = (I: typeof Mail) => <I size={18} color={t.colors.textMuted} />;
  if (confirmEmail) return <CheckEmail email={confirmEmail} onBack={onSignIn} />;
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
      // Supabase never reveals whether an account exists; only rate limits / network errors land here.
      setError(authErrorMessage(e));
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

/** Shown after opening a password-reset link: sets the new password on the recovered session. */
export function NewPasswordFormView({ onDone }: { onDone: () => void }) {
  const t = useTheme();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<NewPasswordForm>({ resolver: zodResolver(newPasswordFormSchema), defaultValues: { password: '', confirmPassword: '' } });
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await session.updatePassword(v.password);
      onDone();
    } catch (e) {
      setError(authErrorMessage(e));
    }
  });
  const icon = <Lock size={18} color={t.colors.textMuted} />;
  return (
    <View style={{ gap: 14 }}>
      <FormError message={error} />
      <Field control={control} name="password" label="New password" placeholder="At least 8 characters" secureToggle autoComplete="new-password" textContentType="newPassword" leftIcon={icon} hint="Use 8+ characters with a letter and a number." />
      <Field control={control} name="confirmPassword" label="Confirm new password" placeholder="Repeat password" secureToggle autoComplete="new-password" leftIcon={icon} onSubmitEditing={() => void submit()} />
      <Button title="Save new password" onPress={() => void submit()} loading={formState.isSubmitting} />
    </View>
  );
}
