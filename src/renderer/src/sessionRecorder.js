export function preferredRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  const choices = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ]
  return choices.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

export async function startSessionRecorder({ sessionId, sourceId, onState }) {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('Screen recording is not supported on this device.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxFrameRate: 15
      }
    }
  })
  const mimeType = preferredRecorderMimeType()
  let recorder
  try {
    recorder = mimeType
      ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_000_000 })
      : new MediaRecorder(stream, { videoBitsPerSecond: 2_000_000 })
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop())
    throw error
  }
  let writeChain = Promise.resolve()
  let writeError = null

  try {
    await window.api.startSessionRecording(sessionId, { mimeType: recorder.mimeType || 'video/webm' })
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop())
    throw error
  }

  recorder.addEventListener('dataavailable', (event) => {
    if (!event.data?.size || writeError) return
    writeChain = writeChain
      .then(() => event.data.arrayBuffer())
      .then((buffer) => window.api.appendSessionRecording(sessionId, buffer))
      .catch(async (error) => {
        writeError = error
        onState?.({ status: 'failed', error: error?.message || 'Recording could not be saved.' })
        if (recorder.state !== 'inactive') recorder.stop()
        await window.api.discardTradingSessionRecording(sessionId).catch(() => {})
      })
  })
  recorder.addEventListener('error', (event) => {
    writeError = event.error || new Error('Screen recording stopped unexpectedly.')
    onState?.({ status: 'failed', error: writeError.message })
  })
  stream.getVideoTracks()[0]?.addEventListener('ended', () => {
    if (recorder.state !== 'inactive') recorder.stop()
    onState?.({ status: 'stopped', error: 'Screen sharing was stopped.' })
  })

  try {
    recorder.start(2000)
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop())
    await window.api.discardTradingSessionRecording(sessionId).catch(() => {})
    throw error
  }
  onState?.({ status: 'recording' })

  return {
    async stop() {
      if (recorder.state !== 'inactive') {
        await new Promise((resolve) => {
          recorder.addEventListener('stop', resolve, { once: true })
          recorder.stop()
        })
      }
      stream.getTracks().forEach((track) => track.stop())
      await writeChain
      if (writeError) {
        await window.api.discardTradingSessionRecording(sessionId).catch(() => {})
        throw writeError
      }
      return window.api.finishSessionRecording(sessionId)
    },
    stopTracks() {
      stream.getTracks().forEach((track) => track.stop())
    }
  }
}
