import { combineLatest, debounceTime, delay, filter, map, merge, of, share, startWith, Subject, switchMap } from 'rxjs';
import { observable, runInAction, computed, makeObservable } from 'mobx';
import { injectable } from 'inversify';

import { MoviesApi } from '~data/api/movies-api.store';
import { Disposable } from '~data/disposable';
import { Movie, MoviesPage } from '~data/types';
import { logger } from '~data/logger/logger.store';

export const enum MovieSearchErrorType {
    BadInput,
    ServerError,
}

type MovieSearchError = Readonly<{
    type: MovieSearchErrorType;
    message: string; // todo: i18n
}>;
const MIN_CHARACTERS_FOR_SEARCH = 3;
const SERVER_ERROR: MovieSearchError = {
    type: MovieSearchErrorType.ServerError,
    message: 'Oops, something went wrong. Please try again later.',
};

@injectable()
export class MoviesStore extends Disposable {
    @observable
    private _error: MovieSearchError | undefined = undefined;
    @observable
    private _noResultsFound = false;
    private readonly _moviesResponses = observable.array<MoviesPage>([]);
    private readonly _searchString$ = new Subject<string>();
    private readonly _loadPage$ = new Subject<number>();
    private readonly _loadMore$ = new Subject<void>();

    constructor(
        private readonly _moviesApi: MoviesApi,
    ) {
        super();
        makeObservable(this);

        const serverError$ = new Subject<MovieSearchError>();
        const searchInput$ = this._searchString$.pipe(
            debounceTime(500),
            share(),
        );

        this._disposeBag.add(
            combineLatest(
                [
                    searchInput$.pipe(
                        filter(isQueryValid),
                    ),
                    merge(
                        this._loadPage$.pipe(
                            startWith(1),
                        ),
                        searchInput$.pipe(
                            map(() => 1),
                        ),
                    ),
                ]
            ).pipe(
                switchMap(([searchString, page]) => this._moviesApi.search({query: searchString, page})),
            ).subscribe({
                next: moviesData => {
                    runInAction(() => {
                        this._moviesResponses.clear();
                        this._moviesResponses.push(moviesData);
                        this._noResultsFound = moviesData.movies.length === 0;
                    });
                },
                error: error => {
                    serverError$.next(SERVER_ERROR);
                    logger.error('Failed getting movies: ', error);
                },

            })
        );


        this._disposeBag.add(
            combineLatest([
                this._searchString$,
                this._loadMore$,
            ]).pipe(
                switchMap(([searchString]) => {
                    return this._moviesApi.search({query: searchString, page: (this.lastOfCurrentPages ?? 1) + 1})
                })).subscribe({
                next: moviesData => {
                    runInAction(() => {
                        this._moviesResponses.push(moviesData);
                    });
                },
                error: error => {
                    serverError$.next(SERVER_ERROR);
                    logger.error('Failed getting more movies for page: ', error);
                },
            })
        );

        this._disposeBag.add(
            merge(
                searchInput$.pipe(
                    switchMap(query => {
                        return query.length === 0 || isQueryValid(query)
                            ? of(undefined)
                            : of({
                                type: MovieSearchErrorType.BadInput,
                                message: `Please enter at least ${MIN_CHARACTERS_FOR_SEARCH} characters`,
                            }).pipe(delay(500));
                    }),
                ),
                serverError$,
            ).subscribe(error => {
                runInAction(() => {
                    this._error = error;
                });
            }),
        );
    }

    @computed
    get totalPages(): number {
        // every response has the same total_pages
        return this._moviesResponses[0]?.totalPages ?? 0;
    }

    @computed.struct
    get currentPages(): readonly number[] {
        return this._moviesResponses.map(response => response.page);
    }

    @computed
    get firstOfCurrentPages(): number | undefined {
        return this.currentPages[0];
    }

    @computed
    get lastOfCurrentPages(): number | undefined {
        return this.currentPages[this.currentPages.length - 1];
    }

    get noResultsFound(): boolean {
        return this._noResultsFound;
    }

    setCurrentPage(page: number): void {
        this._loadPage$.next(page);
    }

    loadMore(): void {
        this._loadMore$.next();
    }

    @computed.struct
    get pagesToPickFrom(): readonly number[] {
        // showing 2 first pages, 2 last pages and 4 pages around current page
        const currentLowestPage = this.currentPages[0];
        const currentHighestPage = this.currentPages[this.currentPages.length - 1];
        const pages = new Set([
            1,
            2,
            currentLowestPage - 2,
            currentLowestPage - 1,
            ...this.currentPages,
            currentHighestPage + 1,
            currentHighestPage + 2,
            this.totalPages - 1,
            this.totalPages,
        ]);
        return Array.from(pages).filter(page => page > 0 && page <= this.totalPages);
    }

    @computed.struct
    get movies(): readonly Movie[] {
        return this._moviesResponses.flatMap(response => response.movies);
    }

    get error(): MovieSearchError | undefined {
        return this._error;
    }

    searchForString(val: string): void {
        this._searchString$.next(val);
    }
}

function isQueryValid(query: string): boolean {
    return query.trim().length >= MIN_CHARACTERS_FOR_SEARCH;
}