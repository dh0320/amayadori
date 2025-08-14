// lib/api.ts
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from './firebase'

const region = process.env.NEXT_PUBLIC_FUNCTIONS_REGION || 'asia-northeast1'
const fns = getFunctions(app, region)

export const callEnter   = httpsCallable(fns, 'enter')
export const callLeave   = httpsCallable(fns, 'leaveRoom')
export const callOwnerAI = httpsCallable(fns, 'ownerAI')
