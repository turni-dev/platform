import { ProblemType } from '@turni/contracts';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { sendProblem } from './problem-details.js';

/**
 * The last-resort RFC 7807 surface: a Fastify error handler, so a module
 * that forgets to catch its own errors still answers
 * `application/problem+json` instead of Fastify's default plain-JSON error
 * shape. Route-level `problems.ts` helpers remain the preferred path — this
 * only catches what they didn't.
 *
 * Deliberately does not also call `setNotFoundHandler`: `createHttpApp`
 * wraps this in a NestJS `FastifyAdapter`, and Nest's own `app.init()`
 * registers its 404 handler unconditionally — a second registration throws
 * ("Not found handler already set"). {@link registerProblemNotFoundHandler}
 * covers the 404 case for a plain (non-Nest) Fastify instance.
 */
export function registerProblemErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      sendProblem(reply, {
        type: ProblemType.InvalidRequest,
        title: 'Invalid request',
        status: 400,
        instance: request.url
      });

      return;
    }

    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : undefined;

    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      sendProblem(reply, {
        type: ProblemType.InvalidRequest,
        title: 'Invalid request',
        status: statusCode,
        instance: request.url
      });

      return;
    }

    // An error we do not model is ours, not the caller's: log the cause,
    // tell the caller nothing but that it failed.
    console.error(`Unhandled error on ${request.url}`, error);
    sendProblem(reply, {
      type: ProblemType.InvalidRequest,
      title: 'Internal error',
      status: 500,
      instance: request.url
    });
  });
}

/**
 * The RFC 7807 404 for a plain Fastify instance (no NestJS `FastifyAdapter`
 * in front of it). `createHttpApp` never calls this — Nest owns 404 there —
 * this exists for a module that stands up its own Fastify instance directly.
 */
export function registerProblemNotFoundHandler(fastify: FastifyInstance): void {
  fastify.setNotFoundHandler((request, reply) => {
    sendProblem(reply, {
      type: ProblemType.InvalidRequest,
      title: 'Not found',
      status: 404,
      instance: request.url
    });
  });
}
