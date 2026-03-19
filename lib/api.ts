// lib/api.ts
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from './firebase'

const region = process.env.NEXT_PUBLIC_FUNCTIONS_REGION || 'asia-northeast1'
const fns = app ? getFunctions(app, region) : null

function missingFirebaseError() {
  throw new Error('Firebase is not configured')
}

export const callEnter = fns
  ? httpsCallable(fns, 'enter')
  : async () => missingFirebaseError()

export const callLeave = fns
  ? httpsCallable(fns, 'leaveRoom')
  : async () => missingFirebaseError()

export const callOwnerAI = fns
  ? httpsCallable(fns, 'ownerAI')
  : async () => missingFirebaseError()
