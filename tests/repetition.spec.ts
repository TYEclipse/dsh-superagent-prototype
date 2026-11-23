import { describe, expect, it } from 'vitest'
import { MAX_NUDGES, REPEATED_CALLS, REPEATED_RESULTS, REPETITION_WINDOW, Repetition, type RepetitionEvent } from '../src/executor/repetition.ts'

const turn = (number: number): RepetitionEvent => ({ type: 'turn/start', data: { turn: number } })
const call = (id: string, step: number, options: { turn?: number; name?: string; arguments?: string } = {}): RepetitionEvent => ({
  type: 'tool/call',
  data: { turn: options.turn ?? 1, step, callId: id, name: options.name ?? 'bash', arguments: options.arguments ?? '{"command":"pnpm test"}' },
})
const result = (id: string, step: number, text = '1 test failed', options: { turn?: number; isError?: boolean } = {}): RepetitionEvent => ({
  type: 'tool/result',
  data: { turn: options.turn ?? 1, step, message: { toolCallId: id, content: [{ type: 'text', text }], isError: options.isError } },
})
/** The same three calls and results across three steps, which is one repeated result. */
function threeSteps(repetition: Repetition, text = '1 test failed'): Array<ReturnType<Repetition['observe']>> {
  return [1, 2, 3].flatMap(step => [
    repetition.observe(call(`c${step}`, step)),
    repetition.observe(result(`c${step}`, step, text)),
  ])
}

describe('repetition', () => {
  it('signals the same result returned for the same call on the third step, without leaking the arguments', () => {
    const repetition = new Repetition()
    expect(repetition.observe(turn(1))).toBeUndefined()
    const seen = threeSteps(repetition)
    expect(seen.slice(0, -1).every(signal => signal === undefined)).toBe(true)
    const signal = seen.at(-1)!
    expect(signal).toMatchObject({ pattern: 'repeated-result', tool: 'bash', count: 3 })
    expect(signal.id).toContain('repeated-result')
    expect(signal.text).toContain('No progress')
    expect(signal.text).toContain('`bash`')
    expect(signal.text).not.toContain('pnpm test')
  })

  it('does not signal a batch of identical calls issued in one step', () => {
    const repetition = new Repetition()
    for (const id of ['c1', 'c2', 'c3']) {
      expect(repetition.observe(call(id, 1))).toBeUndefined()
      expect(repetition.observe(result(id, 1))).toBeUndefined()
    }
  })

  it('signals identical calls across steps on the fifth call, even when their results differ', () => {
    const repetition = new Repetition()
    for (let step = 1; step < REPEATED_CALLS; step++) {
      expect(repetition.observe(call(`c${step}`, step))).toBeUndefined()
      expect(repetition.observe(result(`c${step}`, step, `output ${step}`))).toBeUndefined()
    }
    const signal = repetition.observe(call(`c${REPEATED_CALLS}`, REPEATED_CALLS))
    expect(signal).toMatchObject({ pattern: 'repeated-call', tool: 'bash', count: REPEATED_CALLS })
    expect(signal!.text).toContain('identical arguments')
  })

  it('treats object key order in arguments as the same call', () => {
    const repetition = new Repetition()
    const forms = ['{"command":"pnpm test","timeoutMs":1000}', '{"timeoutMs":1000,"command":"pnpm test"}']
    for (let step = 1; step < REPEATED_CALLS; step++) {
      expect(repetition.observe(call(`c${step}`, step, { arguments: forms[(step - 1) % forms.length]! }))).toBeUndefined()
      expect(repetition.observe(result(`c${step}`, step, `output ${step}`))).toBeUndefined()
    }
    expect(repetition.observe(call(`c${REPEATED_CALLS}`, REPEATED_CALLS, { arguments: forms[0]! })))
      .toMatchObject({ pattern: 'repeated-call' })
  })

  it('treats invalid argument JSON as the raw text it is', () => {
    const repetition = new Repetition()
    for (let step = 1; step < REPEATED_CALLS; step++) {
      expect(repetition.observe(call(`c${step}`, step, { arguments: '{"command":' }))).toBeUndefined()
      expect(repetition.observe(result(`c${step}`, step, `output ${step}`))).toBeUndefined()
    }
    expect(repetition.observe(call(`c${REPEATED_CALLS}`, REPEATED_CALLS, { arguments: '{"command":' })))
      .toMatchObject({ pattern: 'repeated-call' })
  })

  it('treats object key order in a result as the same result', () => {
    const repetition = new Repetition()
    const contents = [
      [{ type: 'text', text: 'same', meta: { b: 1, a: 2 } }],
      [{ type: 'text', text: 'same', meta: { a: 2, b: 1 } }],
    ]
    for (let step = 1; step <= REPEATED_RESULTS; step++) {
      const id = `c${step}`
      expect(repetition.observe(call(id, step))).toBeUndefined()
      const event: RepetitionEvent = { type: 'tool/result', data: { turn: 1, step,
        message: { toolCallId: id, content: contents[(step - 1) % contents.length]! } } }
      const signal = repetition.observe(event)
      if (step < REPEATED_RESULTS) expect(signal).toBeUndefined()
      else expect(signal).toMatchObject({ pattern: 'repeated-result' })
    }
  })

  it('does not treat a failed result and a successful one as the same result', () => {
    const repetition = new Repetition()
    for (let step = 1; step <= REPEATED_RESULTS; step++) {
      expect(repetition.observe(call(`c${step}`, step))).toBeUndefined()
      const signal = repetition.observe(result(`c${step}`, step, 'same', { isError: step % 2 === 0 }))
      expect(signal).toBeUndefined()
    }
  })

  it('does not treat a same result interrupted by a different one as a repeated result', () => {
    const repetition = new Repetition()
    const texts = ['same', 'other', 'same', 'same']
    for (let step = 1; step <= texts.length; step++) {
      expect(repetition.observe(call(`c${step}`, step))).toBeUndefined()
      expect(repetition.observe(result(`c${step}`, step, texts[step - 1]!))).toBeUndefined()
    }
  })

  it('sends one message per repeated call and turn', () => {
    const repetition = new Repetition()
    threeSteps(repetition)
    expect(repetition.observe(call('c4', 4))).toBeUndefined()
    expect(repetition.observe(result('c4', 4))).toBeUndefined()
  })

  it('starts a fresh window and a fresh nudge budget on a new turn', () => {
    const repetition = new Repetition()
    threeSteps(repetition)
    expect(repetition.observe(turn(2))).toBeUndefined()
    for (let step = 1; step <= REPEATED_RESULTS; step++) {
      expect(repetition.observe(call(`d${step}`, step, { turn: 2 }))).toBeUndefined()
      const signal = repetition.observe(result(`d${step}`, step, '1 test failed', { turn: 2 }))
      if (step < REPEATED_RESULTS) expect(signal).toBeUndefined()
      else expect(signal).toMatchObject({ pattern: 'repeated-result', id: expect.stringContaining('loop:2:') })
    }
  })

  it('resets to a fresh window', () => {
    const repetition = new Repetition()
    threeSteps(repetition)
    repetition.reset()
    expect(repetition.observe(call('c1', 1, { turn: 1 }))).toBeUndefined()
    expect(repetition.observe(result('c1', 1))).toBeUndefined()
  })

  it('caps the messages one turn may send', () => {
    const repetition = new Repetition()
    const signalOf = (tool: string) => {
      let last: ReturnType<Repetition['observe']> = undefined
      for (let step = 1; step <= REPEATED_RESULTS; step++) {
        const id = `${tool}-${step}`
        repetition.observe(call(id, step, { name: tool, arguments: '{"same":true}' }))
        last = repetition.observe(result(id, step, 'same'))
      }
      return last
    }
    for (let index = 0; index < MAX_NUDGES; index++) expect(signalOf(`tool${index}`)).toMatchObject({ pattern: 'repeated-result' })
    expect(signalOf(`tool${MAX_NUDGES}`)).toBeUndefined()
  })

  it('forgets calls that left the window', () => {
    const repetition = new Repetition()
    for (let step = 1; step < REPEATED_CALLS; step++) {
      repetition.observe(call(`c${step}`, step))
      repetition.observe(result(`c${step}`, step, `output ${step}`))
    }
    // Ten other calls push every earlier call out of the window.
    for (let index = 0; index < REPETITION_WINDOW; index++) {
      const id = `other${index}`
      repetition.observe(call(id, REPETITION_WINDOW + index, { name: 'grep', arguments: `{"pattern":"p${index}"}` }))
      repetition.observe(result(id, REPETITION_WINDOW + index, `result ${index}`))
    }
    expect(repetition.observe(call('again', REPETITION_WINDOW * 2 + 1))).toBeUndefined()
  })

  it('ignores a result for a call it never saw', () => {
    const repetition = new Repetition()
    expect(repetition.observe(result('missing', 1))).toBeUndefined()
  })

  it('keeps a repeated tool name safe to read in the message', () => {
    const repetition = new Repetition()
    for (let step = 1; step <= REPEATED_RESULTS; step++) {
      const id = `c${step}`
      repetition.observe(call(id, step, { name: 'bash\nrm -rf /' }))
      const signal = repetition.observe(result(id, step, 'same'))
      if (step === REPEATED_RESULTS) {
        expect(signal!.tool).toMatch(/^bash\?/)
        expect(signal!.text).not.toContain('\n')
      }
    }
  })
})
