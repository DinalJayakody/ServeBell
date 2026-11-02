import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { Backdrop, type BackdropPhoto } from './Backdrop';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  /** Restaurant photo fading into the page background. */
  photo?: BackdropPhoto;
  photoHeight?: number;
  fullPhoto?: boolean;
}

/** Standard page shell: themed backdrop, safe area, 20px gutters, keyboard handling. */
export function Screen({ children, scroll, edges = ['top'], padded = true, contentStyle, footer, photo, photoHeight, fullPhoto }: ScreenProps) {
  const pad = padded ? { paddingHorizontal: 20 } : null;
  return (
    <View style={{ flex: 1 }}>
      <Backdrop photo={photo} photoHeight={photoHeight} full={fullPhoto} />
      <SafeAreaView edges={edges} style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[pad, { paddingBottom: 32, flexGrow: 1 }, contentStyle]} showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          ) : (
            <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
          )}
          {footer ? <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8 }}>{footer}</View> : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
