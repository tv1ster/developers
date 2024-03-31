import React, { Fragment } from 'react';
import { observer } from 'mobx-react';
import { useInjection } from 'inversify-react';
import { MoviesStore } from '../movies.store';
import { Page } from './page';
import { PaginationWrapper, PaginationPagesWrapper, PageItem } from './pagination.styled';

export const Pagination = observer(() => {
    const moviesStore = useInjection(MoviesStore);

    if (moviesStore.currentPages.length === 0) {
        return null;
    }

    const selectPage = (page: number) => {
        if (page > 0 && page <= moviesStore.totalPages) {
            moviesStore.setCurrentPage(page);
        }
    }

    return (
        <PaginationWrapper>
            <PageItem
                current={false}
                disabled={moviesStore.currentPages.includes(1)}
                onClick={() => selectPage((moviesStore?.firstOfCurrentPages ?? 1) - 1)}
            >
                Previous
            </PageItem>
            <PaginationPagesWrapper>
                {
                    moviesStore.pagesToPickFrom.map((page, i) => (
                        <Fragment key={page.toString()}>
                            <Page
                                page={page}
                                selectPage={selectPage}
                                previousItemInPagination={moviesStore.pagesToPickFrom[i - 1]}
                            />
                        </Fragment>
                    ))
                }
            </PaginationPagesWrapper>
            <PageItem
                current={false}
                disabled={moviesStore.currentPages.includes(moviesStore.totalPages)}
                onClick={() => selectPage((moviesStore.lastOfCurrentPages ?? 1) + 1)}
            >
                Next
            </PageItem>
        </PaginationWrapper>
    );

});